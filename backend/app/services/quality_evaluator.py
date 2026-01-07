"""
Quality evaluation service for LLM outputs.
"""
import json
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from app.models.api_call import APICall
from app.models.quality_score import QualityScore


class QualityEvaluator:
    """Evaluate quality of LLM outputs"""
    
    # Score component weights (transparent scoring system)
    WEIGHTS = {
        "json_structure": 0.30,  # 30% - JSON structure integrity
        "semantic_similarity": 0.40,  # 40% - Semantic similarity
        "external_validator": 0.10,  # 10% - External validator score
        "consistency_over_time": 0.20,  # 20% - Consistency over time
    }
    
    # Rule-based component weights
    RULE_WEIGHTS = {
        "json_validity": 0.30,
        "required_fields": 0.25,
        "length_acceptable": 0.25,
        "format_valid": 0.20,
    }
    
    # LLM-based component weights
    LLM_WEIGHTS = {
        "semantic_consistency": 0.40,
        "tone": 0.30,
        "coherence": 0.30,
    }
    
    def __init__(self):
        self.min_length_threshold = 10  # Minimum expected response length
        self.max_length_threshold = 100000  # Maximum expected response length
    
    def evaluate(
        self,
        api_call: APICall,
        expected_schema: Optional[Dict[str, Any]] = None,
        required_fields: Optional[List[str]] = None,
        use_advanced: bool = False
    ) -> QualityScore:
        """
        Evaluate the quality of an API call response
        
        Args:
            api_call: The API call to evaluate
            expected_schema: Optional JSON schema to validate against
            required_fields: Optional list of required field names
        
        Returns:
            QualityScore object
        """
        response_data = api_call.response_data or {}
        response_text = api_call.response_text or ""
        
        # Rule-based evaluations
        json_valid = self._check_json_validity(response_data, response_text)
        required_fields_present = self._check_required_fields(
            response_data, required_fields
        ) if required_fields else None
        length_acceptable = self._check_length(response_text)
        format_valid = self._check_format(response_data, response_text)
        
        # Calculate rule-based score with transparent weights
        rule_scores = {}
        rule_scores_weighted = []
        
        if json_valid is not None:
            score = 100 if json_valid else 0
            rule_scores["json_validity"] = score
            rule_scores_weighted.append(score * self.RULE_WEIGHTS["json_validity"])
        
        if required_fields_present is not None:
            score = 100 if required_fields_present else 0
            rule_scores["required_fields"] = score
            rule_scores_weighted.append(score * self.RULE_WEIGHTS["required_fields"])
        
        if length_acceptable is not None:
            score = 100 if length_acceptable else 0
            rule_scores["length_acceptable"] = score
            rule_scores_weighted.append(score * self.RULE_WEIGHTS["length_acceptable"])
        
        if format_valid is not None:
            score = 100 if format_valid else 0
            rule_scores["format_valid"] = score
            rule_scores_weighted.append(score * self.RULE_WEIGHTS["format_valid"])
        
        rule_based_score = sum(rule_scores_weighted) if rule_scores_weighted else 50.0
        
        # LLM-based evaluations (simplified for MVP)
        # In production, these would use actual LLM calls
        # Only calculate if advanced features are enabled
        llm_scores = {}
        llm_scores_weighted = []
        
        if use_advanced:
            semantic_consistency_score = self._evaluate_semantic_consistency(response_text)
            tone_score = self._evaluate_tone(response_text)
            coherence_score = self._evaluate_coherence(response_text)
            
            if semantic_consistency_score is not None:
                llm_scores["semantic_consistency"] = semantic_consistency_score
                llm_scores_weighted.append(semantic_consistency_score * self.LLM_WEIGHTS["semantic_consistency"])
            
            if tone_score is not None:
                llm_scores["tone"] = tone_score
                llm_scores_weighted.append(tone_score * self.LLM_WEIGHTS["tone"])
            
            if coherence_score is not None:
                llm_scores["coherence"] = coherence_score
                llm_scores_weighted.append(coherence_score * self.LLM_WEIGHTS["coherence"])
        else:
            semantic_consistency_score = None
            tone_score = None
            coherence_score = None
        
        # Calculate overall score (weighted average)
        # 60% rule-based, 40% LLM-based (if available)
        if llm_scores_weighted:
            llm_based_score = sum(llm_scores_weighted)
            overall_score = (rule_based_score * 0.6) + (llm_based_score * 0.4)
        else:
            overall_score = rule_based_score
        
        # Collect violations
        violations = []
        if json_valid is False:
            violations.append("invalid_json")
        if required_fields_present is False:
            violations.append("missing_required_fields")
        if length_acceptable is False:
            violations.append("length_out_of_range")
        if format_valid is False:
            violations.append("format_invalid")
        
        # Create quality score with transparent breakdown
        evaluation_details = {
            "rule_based_score": rule_based_score,
            "rule_scores": rule_scores,
            "rule_weights": self.RULE_WEIGHTS,
            "response_length": len(response_text),
            "overall_score_formula": "60% rule-based + 40% LLM-based (if available)",
        }
        
        if llm_scores:
            evaluation_details["llm_based_score"] = sum(llm_scores_weighted)
            evaluation_details["llm_scores"] = llm_scores
            evaluation_details["llm_weights"] = self.LLM_WEIGHTS
        
        evaluation_details["score_breakdown"] = {
            "json_structure_integrity": {
                "score": rule_scores.get("json_validity", 0),
                "weight": self.RULE_WEIGHTS.get("json_validity", 0) * 0.6,
                "contribution": rule_scores.get("json_validity", 0) * self.RULE_WEIGHTS.get("json_validity", 0) * 0.6,
            },
            "semantic_similarity": {
                "score": llm_scores.get("semantic_consistency", 0) if llm_scores else 0,
                "weight": self.LLM_WEIGHTS.get("semantic_consistency", 0) * 0.4 if llm_scores else 0,
                "contribution": (llm_scores.get("semantic_consistency", 0) * self.LLM_WEIGHTS.get("semantic_consistency", 0) * 0.4) if llm_scores else 0,
            },
            "external_validator": {
                "score": rule_scores.get("format_valid", 0),
                "weight": self.RULE_WEIGHTS.get("format_valid", 0) * 0.6,
                "contribution": rule_scores.get("format_valid", 0) * self.RULE_WEIGHTS.get("format_valid", 0) * 0.6,
            },
            "consistency_over_time": {
                "score": llm_scores.get("coherence", 0) if llm_scores else 0,
                "weight": self.LLM_WEIGHTS.get("coherence", 0) * 0.4 if llm_scores else 0,
                "contribution": (llm_scores.get("coherence", 0) * self.LLM_WEIGHTS.get("coherence", 0) * 0.4) if llm_scores else 0,
            },
        }
        
        quality_score = QualityScore(
            api_call_id=api_call.id,
            project_id=api_call.project_id,
            overall_score=overall_score,
            json_valid=json_valid,
            required_fields_present=required_fields_present,
            length_acceptable=length_acceptable,
            format_valid=format_valid,
            semantic_consistency_score=semantic_consistency_score,
            tone_score=tone_score,
            coherence_score=coherence_score,
            evaluation_details=evaluation_details,
            violations=violations if violations else None
        )
        
        return quality_score
    
    def _check_json_validity(
        self,
        response_data: Dict[str, Any],
        response_text: str
    ) -> Optional[bool]:
        """Check if response is valid JSON"""
        if response_data:
            # If we have parsed JSON, it's valid
            return True
        
        # Try to parse response_text as JSON
        try:
            json.loads(response_text)
            return True
        except (json.JSONDecodeError, TypeError):
            return False
    
    def _check_required_fields(
        self,
        response_data: Dict[str, Any],
        required_fields: List[str]
    ) -> Optional[bool]:
        """Check if all required fields are present"""
        if not response_data or not isinstance(response_data, dict):
            return False
        
        for field in required_fields:
            if field not in response_data:
                return False
        
        return True
    
    def _check_length(self, response_text: str) -> Optional[bool]:
        """Check if response length is acceptable"""
        length = len(response_text)
        return self.min_length_threshold <= length <= self.max_length_threshold
    
    def _check_format(
        self,
        response_data: Dict[str, Any],
        response_text: str
    ) -> Optional[bool]:
        """Check basic format validity"""
        # Check for common format issues
        if not response_text:
            return False
        
        # Check for markdown issues (basic check)
        if "```" in response_text:
            # Count opening and closing code blocks
            open_blocks = response_text.count("```")
            if open_blocks % 2 != 0:
                return False
        
        return True
    
    def _evaluate_semantic_consistency(self, response_text: str) -> Optional[float]:
        """
        Evaluate semantic consistency (simplified for MVP)
        In production, this would use LLM to evaluate consistency
        """
        # Placeholder: return a default score
        # In production, this would:
        # 1. Compare with previous responses
        # 2. Use LLM to evaluate semantic similarity
        # 3. Check for contradictions
        if not response_text:
            return 0.0
        
        # Basic heuristic: longer responses tend to be more consistent
        # This is a placeholder - should be replaced with actual LLM evaluation
        base_score = 70.0
        length_factor = min(len(response_text) / 1000, 1.0) * 20.0
        return min(base_score + length_factor, 100.0)
    
    def _evaluate_tone(self, response_text: str) -> Optional[float]:
        """
        Evaluate tone consistency (simplified for MVP)
        In production, this would use LLM to evaluate tone
        """
        if not response_text:
            return 0.0
        
        # Placeholder: basic tone check
        # In production, this would use LLM to compare tone with baseline
        return 75.0
    
    def _evaluate_coherence(self, response_text: str) -> Optional[float]:
        """
        Evaluate reasoning coherence (simplified for MVP)
        In production, this would use LLM to evaluate logical flow
        """
        if not response_text:
            return 0.0
        
        # Placeholder: basic coherence check
        # In production, this would use LLM to evaluate logical consistency
        return 80.0
    
    def evaluate_batch(
        self,
        api_calls: List[APICall],
        expected_schema: Optional[Dict[str, Any]] = None,
        required_fields: Optional[List[str]] = None,
        db: Optional[Session] = None,
        use_advanced: bool = True
    ) -> List[QualityScore]:
        """
        Evaluate multiple API calls in batch
        
        Returns:
            List of QualityScore objects
        """
        scores = []
        for api_call in api_calls:
            score = self.evaluate(api_call, expected_schema, required_fields, use_advanced)
            scores.append(score)
            
            # Save to database if session provided
            if db:
                db.add(score)
        
        if db:
            db.commit()
        
        return scores
    
    def evaluate_parallel(
        self,
        prompt: str,
        models: List[Dict[str, str]],  # [{"provider": "openai", "model": "gpt-4"}, ...]
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Evaluate the same prompt across multiple models in parallel
        
        This provides relative scores by comparing outputs from different models,
        which increases trust in the quality assessment.
        
        Args:
            prompt: The prompt to evaluate
            models: List of model configurations
            db: Optional database session
        
        Returns:
            Dictionary with:
            - results: List of evaluation results per model
            - relative_scores: Normalized scores (0-100) relative to best model
            - recommendations: Best model recommendations
        """
        import asyncio
        import httpx
        
        # This is a simplified implementation
        # In production, this would make actual API calls to each model
        results = []
        
        for model_config in models:
            provider = model_config.get("provider")
            model = model_config.get("model")
            
            # Simulate API call (in production, make actual calls)
            # For now, return placeholder scores
            result = {
                "provider": provider,
                "model": model,
                "model_key": f"{provider}/{model}",
                "response": f"Simulated response for {model}",
                "quality_score": 75.0 + (hash(f"{provider}{model}") % 20),  # Placeholder
                "latency_ms": 1000.0 + (hash(f"{provider}{model}") % 1000),
                "cost_estimate": 0.01 + (hash(f"{provider}{model}") % 10) / 1000,
            }
            results.append(result)
        
        # Calculate relative scores (normalize to 0-100 based on best model)
        if results:
            max_score = max(r["quality_score"] for r in results)
            min_score = min(r["quality_score"] for r in results)
            score_range = max_score - min_score if max_score != min_score else 1.0
            
            for result in results:
                # Normalize to 0-100 relative to best model
                relative_score = ((result["quality_score"] - min_score) / score_range) * 100
                result["relative_score"] = relative_score
                result["rank"] = 0  # Will be set after sorting
        
            # Sort by quality score
            results.sort(key=lambda x: x["quality_score"], reverse=True)
            for i, result in enumerate(results):
                result["rank"] = i + 1
        
        # Generate recommendations
        if results:
            best_model = results[0]
            recommendations = {
                "best_for_quality": best_model["model_key"],
                "best_for_cost": min(results, key=lambda x: x["cost_estimate"])["model_key"],
                "best_for_speed": min(results, key=lambda x: x["latency_ms"])["model_key"],
                "best_overall": best_model["model_key"],
            }
        else:
            recommendations = {}
        
        return {
            "results": results,
            "relative_scores": {r["model_key"]: r["relative_score"] for r in results},
            "recommendations": recommendations,
            "prompt": prompt,
            "models_tested": len(models),
        }
