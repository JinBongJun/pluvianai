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
    
    def __init__(self):
        self.min_length_threshold = 10  # Minimum expected response length
        self.max_length_threshold = 100000  # Maximum expected response length
    
    def evaluate(
        self,
        api_call: APICall,
        expected_schema: Optional[Dict[str, Any]] = None,
        required_fields: Optional[List[str]] = None
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
        
        # Calculate rule-based score (0-100)
        rule_scores = []
        if json_valid is not None:
            rule_scores.append(100 if json_valid else 0)
        if required_fields_present is not None:
            rule_scores.append(100 if required_fields_present else 0)
        if length_acceptable is not None:
            rule_scores.append(100 if length_acceptable else 0)
        if format_valid is not None:
            rule_scores.append(100 if format_valid else 0)
        
        rule_based_score = sum(rule_scores) / len(rule_scores) if rule_scores else 50.0
        
        # LLM-based evaluations (simplified for MVP)
        # In production, these would use actual LLM calls
        # Only calculate if advanced features are enabled
        if use_advanced:
            semantic_consistency_score = self._evaluate_semantic_consistency(response_text)
            tone_score = self._evaluate_tone(response_text)
            coherence_score = self._evaluate_coherence(response_text)
        else:
            semantic_consistency_score = None
            tone_score = None
            coherence_score = None
        
        # Calculate overall score (weighted average)
        llm_scores = [
            s for s in [semantic_consistency_score, tone_score, coherence_score] if s is not None
        ]
        
        if llm_scores:
            # 60% rule-based, 40% LLM-based
            overall_score = (rule_based_score * 0.6) + (sum(llm_scores) / len(llm_scores) * 0.4)
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
        
        # Create quality score
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
            evaluation_details={
                "rule_based_score": rule_based_score,
                "response_length": len(response_text),
            },
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
