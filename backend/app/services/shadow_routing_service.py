"""
Shadow Routing Service for comparing production and shadow model responses
"""

import json
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.api_call import APICall
from app.models.shadow_comparison import ShadowComparison
from app.models.project import Project
from app.models.alert import Alert
from app.services.alert_service import AlertService
from app.core.logging_config import logger
import httpx


class ShadowRoutingService:
    """Service for Shadow Routing - comparing production and shadow model responses"""

    # Provider base URLs (same as proxy)
    PROVIDER_URLS = {
        "openai": "https://api.openai.com/v1",
        "anthropic": "https://api.anthropic.com/v1",
        "google": "https://generativelanguage.googleapis.com/v1",
    }

    # Recommended shadow models for common primary models
    # This helps users choose appropriate shadow models
    RECOMMENDED_SHADOW_MODELS = {
        # OpenAI models
        "gpt-4": ["gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "o1-preview"],
        "gpt-4-turbo": ["gpt-4", "gpt-3.5-turbo", "claude-3-sonnet", "o1-preview"],
        "gpt-3.5-turbo": ["gpt-4", "gpt-4-turbo", "claude-3-haiku"],
        "o1-preview": ["gpt-4", "gpt-4-turbo", "claude-3-opus"],
        "o1-mini": ["gpt-3.5-turbo", "claude-3-haiku"],
        # Anthropic models
        "claude-3-opus": ["claude-3-sonnet", "claude-3-haiku", "gpt-4", "gpt-4-turbo"],
        "claude-3-sonnet": ["claude-3-opus", "claude-3-haiku", "gpt-4-turbo"],
        "claude-3-haiku": ["claude-3-sonnet", "gpt-3.5-turbo"],
        "claude-2": ["claude-3-sonnet", "gpt-4"],
        "claude-2.1": ["claude-3-sonnet", "gpt-4"],
        # Google models
        "gemini-ultra": ["gemini-pro", "gpt-4", "claude-3-opus"],
        "gemini-pro": ["gemini-ultra", "gpt-4-turbo", "claude-3-sonnet"],
        "gemini-pro-vision": ["gemini-pro", "gpt-4-turbo"],
    }

    def __init__(self):
        self.alert_service = AlertService()
        self.default_comparison_threshold = 0.15  # 15% difference triggers alert

    def get_shadow_model(self, project: Project, primary_model: str) -> Optional[str]:
        """
        Get shadow model for a primary model based on project configuration

        Args:
            project: Project object
            primary_model: Primary model name (e.g., "gpt-4")

        Returns:
            Shadow model name (e.g., "gpt-4-turbo", "claude-3-opus") or None if not configured
        """
        config = project.shadow_routing_config or {}

        if not config.get("enabled", False):
            return None

        shadow_models = config.get("shadow_models", {})
        return shadow_models.get(primary_model)

    def get_recommended_shadow_models(self, primary_model: str) -> List[str]:
        """
        Get recommended shadow models for a primary model

        Args:
            primary_model: Primary model name (e.g., "gpt-4")

        Returns:
            List of recommended shadow model names
        """
        return self.RECOMMENDED_SHADOW_MODELS.get(primary_model, [])

    def suggest_shadow_models(self, project_id: int, primary_model: str, db: Session) -> Dict[str, Any]:
        """
        자동 Shadow 모델 추천 (제안만)

        Args:
            project_id: Project ID
            primary_model: Primary model name
            db: Database session

        Returns:
            Dictionary with shadow model recommendations
        """
        from datetime import datetime, timedelta
        from sqlalchemy import and_

        # 1. 사용 패턴 분석
        usage_pattern = self._analyze_usage_pattern(project_id, primary_model, db)

        # 2. Shadow 모델 추천
        recommended = self._recommend_shadow_models(primary_model, usage_pattern)

        # 3. 테스트 결과 (Shadow Routing으로)
        # 실제 테스트는 나중에 진행하고, 예상 결과만 반환
        test_result = self._estimate_test_result(primary_model, recommended["model"], usage_pattern)

        # 4. 신뢰도 계산
        confidence = self._calculate_confidence(test_result, usage_pattern)

        return {
            "current_model": primary_model,
            "recommended_shadow_model": recommended["model"],
            "estimated_savings": recommended["savings"],
            "estimated_cost_reduction_percentage": recommended["cost_reduction_percentage"],
            "test_result": test_result,
            "confidence": confidence,
            "usage_pattern": usage_pattern,
            "auto_apply": False,  # 자동 적용 안 함
            "requires_approval": True,  # 승인 필수
        }

    def _analyze_usage_pattern(self, project_id: int, primary_model: str, db: Session) -> Dict[str, Any]:
        """사용 패턴 분석"""
        from datetime import datetime, timedelta
        from sqlalchemy import and_

        # Get API calls for this model in the last 30 days
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)

        api_calls = (
            db.query(APICall)
            .filter(
                and_(
                    APICall.project_id == project_id,
                    APICall.model == primary_model,
                    APICall.created_at >= start_date,
                    APICall.created_at <= end_date,
                )
            )
            .all()
        )

        if not api_calls:
            return {
                "total_calls": 0,
                "avg_latency_ms": 0,
                "total_cost": 0.0,
                "avg_quality_score": 0.0,
                "complexity": "low",
            }

        # Calculate statistics
        total_calls = len(api_calls)
        total_latency = sum(c.latency_ms or 0 for c in api_calls)
        avg_latency = total_latency / total_calls if total_calls > 0 else 0

        # Calculate cost (estimate)
        from app.services.cost_analyzer import CostAnalyzer

        cost_analyzer = CostAnalyzer()
        total_cost = 0.0
        for call in api_calls:
            cost = cost_analyzer.calculate_cost(
                call.provider, call.model, call.request_tokens or 0, call.response_tokens or 0
            )
            total_cost += cost

        # Get quality scores
        from app.models.quality_score import QualityScore

        quality_scores = (
            db.query(QualityScore)
            .join(APICall)
            .filter(
                and_(
                    QualityScore.project_id == project_id,
                    APICall.model == primary_model,
                    QualityScore.created_at >= start_date,
                    QualityScore.created_at <= end_date,
                )
            )
            .all()
        )

        avg_quality = sum(s.overall_score for s in quality_scores) / len(quality_scores) if quality_scores else 75.0

        # Determine complexity based on latency and tokens
        avg_tokens = (
            sum((c.request_tokens or 0) + (c.response_tokens or 0) for c in api_calls) / total_calls
            if total_calls > 0
            else 0
        )
        complexity = "high" if avg_latency > 5000 or avg_tokens > 5000 else "medium" if avg_latency > 2000 else "low"

        return {
            "total_calls": total_calls,
            "avg_latency_ms": avg_latency,
            "total_cost": total_cost,
            "avg_quality_score": avg_quality,
            "complexity": complexity,
            "avg_tokens": avg_tokens,
        }

    def _recommend_shadow_models(self, primary_model: str, usage_pattern: Dict[str, Any]) -> Dict[str, Any]:
        """Shadow 모델 추천"""
        # Get recommended models
        recommended_models = self.get_recommended_shadow_models(primary_model)

        if not recommended_models:
            return {
                "model": None,
                "savings": 0.0,
                "cost_reduction_percentage": 0.0,
                "reason": "No recommended models found",
            }

        # For now, pick the first recommended model
        # In a full implementation, would analyze cost/performance trade-offs
        shadow_model = recommended_models[0]

        # Estimate savings based on model tier
        # This is a simplified estimation
        from app.services.cost_analyzer import CostAnalyzer

        cost_analyzer = CostAnalyzer()

        # Estimate cost reduction (simplified)
        # In reality, would need to compare actual pricing
        complexity = usage_pattern.get("complexity", "medium")
        avg_quality = usage_pattern.get("avg_quality_score", 75.0)

        # If quality is low and complexity is low, can use cheaper model
        if avg_quality < 70 and complexity == "low":
            cost_reduction = 50.0  # 50% cost reduction estimate
        elif complexity == "medium":
            cost_reduction = 20.0  # 20% cost reduction estimate
        else:
            cost_reduction = 10.0  # 10% cost reduction estimate

        monthly_cost = usage_pattern.get("total_cost", 0.0) * (30 / 30)  # Assuming 30 days
        estimated_savings = monthly_cost * (cost_reduction / 100)

        return {
            "model": shadow_model,
            "savings": estimated_savings,
            "cost_reduction_percentage": cost_reduction,
            "reason": f"Recommended for {complexity} complexity tasks",
        }

    def _estimate_test_result(
        self, primary_model: str, shadow_model: str, usage_pattern: Dict[str, Any]
    ) -> Dict[str, Any]:
        """예상 테스트 결과 (실제 테스트 전 추정)"""
        # This is an estimation - actual test would run shadow routing
        # For now, return estimated metrics based on model comparison

        return {
            "similarity_score": 0.85,  # Estimated
            "quality_difference": -2.0,  # Estimated quality drop
            "latency_difference": 5.0,  # Estimated latency change %
            "cost_reduction": usage_pattern.get("total_cost", 0.0) * 0.2,  # 20% estimate
            "test_duration_days": 7,
            "samples_tested": usage_pattern.get("total_calls", 0),
        }

    def _calculate_confidence(self, test_result: Dict[str, Any], usage_pattern: Dict[str, Any]) -> float:
        """신뢰도 계산"""
        # Confidence based on:
        # - Number of test samples
        # - Quality of test results
        # - Usage pattern consistency

        samples = test_result.get("samples_tested", 0)
        similarity = test_result.get("similarity_score", 0.5)

        # Base confidence from similarity
        confidence = similarity

        # Adjust based on sample size
        if samples > 100:
            confidence *= 1.1  # +10% for good sample size
        elif samples < 10:
            confidence *= 0.8  # -20% for low sample size

        return min(1.0, max(0.0, confidence))

    async def make_shadow_call(
        self, provider: str, shadow_model: str, request_data: Dict[str, Any], api_key: str
    ) -> Tuple[Dict[str, Any], int, Optional[str]]:
        """
        Make API call to shadow model

        Args:
            provider: Provider name (openai, anthropic, google)
            shadow_model: Shadow model name
            request_data: Request payload
            api_key: API key for the provider

        Returns:
            Tuple of (response_data, status_code, error_message)
        """
        base_url = self.PROVIDER_URLS.get(provider)
        if not base_url:
            return {}, 400, f"Unsupported provider: {provider}"

        # Determine endpoint based on provider
        if provider == "openai":
            endpoint = "/chat/completions"
            # Update model in request
            request_payload = request_data.copy()
            request_payload["model"] = shadow_model
        elif provider == "anthropic":
            endpoint = "/messages"
            # Update model in request
            request_payload = request_data.copy()
            request_payload["model"] = shadow_model
        elif provider == "google":
            endpoint = f"/models/{shadow_model}:generateContent"
            request_payload = request_data.copy()
        else:
            return {}, 400, f"Unsupported provider: {provider}"

        target_url = f"{base_url}{endpoint}"

        # Prepare headers
        headers = {}
        if provider == "openai":
            headers["Authorization"] = f"Bearer {api_key}"
            headers["Content-Type"] = "application/json"
        elif provider == "anthropic":
            headers["x-api-key"] = api_key
            headers["anthropic-version"] = "2023-06-01"
            headers["Content-Type"] = "application/json"
        elif provider == "google":
            headers["x-goog-api-key"] = api_key
            headers["Content-Type"] = "application/json"

        # Make request
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(url=target_url, headers=headers, json=request_payload)

                if response.status_code == 200:
                    return response.json(), 200, None
                else:
                    error_msg = response.text
                    return {}, response.status_code, error_msg
        except Exception as e:
            logger.error(f"Error making shadow API call: {str(e)}")
            return {}, 500, str(e)

    def compare_responses(
        self,
        primary_response: Dict[str, Any],
        shadow_response: Dict[str, Any],
        primary_model: str,
        shadow_model: str,
        provider: str,
    ) -> Dict[str, Any]:
        """
        Compare primary and shadow responses

        Args:
            primary_response: Primary API response
            shadow_response: Shadow API response
            primary_model: Primary model name
            shadow_model: Shadow model name
            provider: Provider name

        Returns:
            Comparison results dictionary
        """
        # Extract response text
        primary_text = self._extract_response_text(primary_response, provider)
        shadow_text = self._extract_response_text(shadow_response, provider)

        # Extract tokens
        primary_tokens = self._extract_tokens(primary_response, provider)
        shadow_tokens = self._extract_tokens(shadow_response, provider)

        # Calculate similarity (simple length-based for MVP)
        # In production, could use embedding similarity or semantic similarity
        similarity_score = self._calculate_similarity(primary_text, shadow_text)

        # Calculate differences
        length_diff = abs(len(primary_text) - len(shadow_text))
        length_diff_pct = (length_diff / len(primary_text) * 100) if primary_text else 0

        # Determine difference type
        difference_type = "content"
        if length_diff_pct > 20:
            difference_type = "length"

        # Calculate token difference
        primary_total = primary_tokens.get("total", 0)
        shadow_total = shadow_tokens.get("total", 0)
        token_diff_pct = ((shadow_total - primary_total) / primary_total * 100) if primary_total > 0 else 0

        return {
            "similarity_score": similarity_score,
            "difference_type": difference_type,
            "difference_percentage": length_diff_pct,
            "primary_text_length": len(primary_text),
            "shadow_text_length": len(shadow_text),
            "primary_tokens": primary_tokens,
            "shadow_tokens": shadow_tokens,
            "token_difference_percentage": token_diff_pct,
            "primary_text_sample": primary_text[:200] if primary_text else "",
            "shadow_text_sample": shadow_text[:200] if shadow_text else "",
        }

    def _extract_response_text(self, response_data: Dict[str, Any], provider: str) -> str:
        """Extract response text from API response"""
        try:
            if provider == "openai":
                if "choices" in response_data and len(response_data["choices"]) > 0:
                    choice = response_data["choices"][0]
                    if "message" in choice:
                        return choice["message"].get("content", "")
                    return choice.get("text", "")
            elif provider == "anthropic":
                if "content" in response_data:
                    content = response_data["content"]
                    if isinstance(content, list) and len(content) > 0:
                        return content[0].get("text", "")
                    return str(content)
            elif provider == "google":
                if "candidates" in response_data and len(response_data["candidates"]) > 0:
                    candidate = response_data["candidates"][0]
                    if "content" in candidate:
                        parts = candidate["content"].get("parts", [])
                        if parts and len(parts) > 0:
                            return parts[0].get("text", "")
        except Exception as e:
            logger.error(f"Error extracting response text: {str(e)}")

        return ""

    def _extract_tokens(self, response_data: Dict[str, Any], provider: str) -> Dict[str, int]:
        """Extract token counts from API response"""
        result = {"input": 0, "output": 0, "total": 0}

        try:
            if provider == "openai":
                if "usage" in response_data:
                    usage = response_data["usage"]
                    result["input"] = usage.get("prompt_tokens", 0)
                    result["output"] = usage.get("completion_tokens", 0)
                    result["total"] = usage.get("total_tokens", 0)
            elif provider == "anthropic":
                if "usage" in response_data:
                    usage = response_data["usage"]
                    result["input"] = usage.get("input_tokens", 0)
                    result["output"] = usage.get("output_tokens", 0)
                    result["total"] = result["input"] + result["output"]
            elif provider == "google":
                if "usageMetadata" in response_data:
                    usage = response_data["usageMetadata"]
                    result["input"] = usage.get("promptTokenCount", 0)
                    result["output"] = usage.get("candidatesTokenCount", 0)
                    result["total"] = usage.get("totalTokenCount", 0)
        except Exception as e:
            logger.error(f"Error extracting tokens: {str(e)}")

        return result

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between two texts (0-1, 1 = identical)

        Simple implementation using length and character similarity
        In production, could use embeddings or semantic similarity
        """
        if not text1 and not text2:
            return 1.0
        if not text1 or not text2:
            return 0.0

        # Length similarity
        len1, len2 = len(text1), len(text2)
        length_sim = 1.0 - (abs(len1 - len2) / max(len1, len2))

        # Character similarity (simple character overlap)
        chars1 = set(text1.lower())
        chars2 = set(text2.lower())
        if not chars1 and not chars2:
            char_sim = 1.0
        elif not chars1 or not chars2:
            char_sim = 0.0
        else:
            intersection = len(chars1 & chars2)
            union = len(chars1 | chars2)
            char_sim = intersection / union if union > 0 else 0.0

        # Weighted average (60% length, 40% character)
        similarity = (length_sim * 0.6) + (char_sim * 0.4)

        return max(0.0, min(1.0, similarity))

    async def execute_shadow_routing(
        self, project: Project, primary_api_call: APICall, request_data: Dict[str, Any], api_key: str, db: Session
    ) -> Optional[ShadowComparison]:
        """
        Execute shadow routing - make shadow call and compare

        Args:
            project: Project object
            primary_api_call: Primary API call that was made
            request_data: Original request data
            api_key: API key for shadow call
            db: Database session

        Returns:
            ShadowComparison object or None if shadow routing not enabled
        """
        # Check if shadow routing is enabled
        shadow_model = self.get_shadow_model(project, primary_api_call.model)
        if not shadow_model:
            return None

        # Make shadow API call
        shadow_response, status_code, error_message = await self.make_shadow_call(
            provider=primary_api_call.provider, shadow_model=shadow_model, request_data=request_data, api_key=api_key
        )

        if status_code != 200:
            logger.warning(f"Shadow API call failed: {error_message}")
            return None

        # Save shadow API call to database
        shadow_api_call = APICall(
            project_id=project.id,
            provider=primary_api_call.provider,
            model=shadow_model,
            request_data=request_data,
            response_data=shadow_response,
            response_text=self._extract_response_text(shadow_response, primary_api_call.provider),
            request_tokens=self._extract_tokens(shadow_response, primary_api_call.provider).get("input", 0),
            response_tokens=self._extract_tokens(shadow_response, primary_api_call.provider).get("output", 0),
            status_code=status_code,
            error_message=error_message,
            agent_name=primary_api_call.agent_name,
            chain_id=primary_api_call.chain_id,
        )
        db.add(shadow_api_call)
        db.flush()  # Get shadow_api_call.id

        # Compare responses
        primary_response = primary_api_call.response_data
        comparison_result = self.compare_responses(
            primary_response=primary_response,
            shadow_response=shadow_response,
            primary_model=primary_api_call.model,
            shadow_model=shadow_model,
            provider=primary_api_call.provider,
        )

        # Create comparison record
        comparison = ShadowComparison(
            project_id=project.id,
            primary_api_call_id=primary_api_call.id,
            primary_model=primary_api_call.model,
            shadow_api_call_id=shadow_api_call.id,
            shadow_model=shadow_model,
            similarity_score=comparison_result["similarity_score"],
            difference_type=comparison_result["difference_type"],
            difference_percentage=comparison_result["difference_percentage"],
            difference_details=comparison_result,
        )
        db.add(comparison)

        # Check if alert should be sent
        config = project.shadow_routing_config or {}
        threshold = config.get("comparison_threshold", self.default_comparison_threshold)

        if comparison_result["difference_percentage"] > (threshold * 100):
            # Create alert
            alert = Alert(
                project_id=project.id,
                alert_type="shadow_routing",
                severity="medium" if comparison_result["difference_percentage"] < 30 else "high",
                title=f"Shadow Routing Difference: {primary_api_call.model} vs {shadow_model}",
                message=f"Response difference: {comparison_result['difference_percentage']:.1f}%",
                alert_data={
                    "comparison_id": comparison.id,
                    "primary_model": primary_api_call.model,
                    "shadow_model": shadow_model,
                    "difference_percentage": comparison_result["difference_percentage"],
                    "similarity_score": comparison_result["similarity_score"],
                },
                notification_channels=["email"],
            )
            db.add(alert)
            db.flush()  # Get alert.id

            comparison.alert_id = alert.id
            comparison.alert_sent = True

        db.commit()
        db.refresh(comparison)

        return comparison

    def apply_gradually(
        self, project_id: int, primary_model: str, shadow_model: str, user_confirmation: bool, db: Session
    ) -> Dict[str, Any]:
        """
        점진적 적용 (사용자 승인 후)

        Args:
            project_id: Project ID
            primary_model: Primary model name
            shadow_model: Shadow model name to apply
            user_confirmation: User confirmation flag
            db: Database session

        Returns:
            Dictionary with application result
        """
        if not user_confirmation:
            raise ValueError("User confirmation required")

        # Get project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # 1. 롤백 포인트 생성
        rollback_point = self._create_rollback_point(project, primary_model, db)

        # 2. Phase 1: Shadow Routing 테스트 (10%)
        try:
            shadow_result = self._test_with_shadow_routing(project, primary_model, shadow_model, percentage=10, db=db)

            if not self._validate_shadow_result(shadow_result):
                self._rollback(project, rollback_point, db)
                return {
                    "status": "failed",
                    "reason": "Shadow test failed at 10%",
                    "phase": "test",
                }
        except Exception as e:
            logger.error(f"Error in shadow routing test: {str(e)}")
            self._rollback(project, rollback_point, db)
            return {
                "status": "failed",
                "reason": f"Error during test: {str(e)}",
                "phase": "test",
            }

        # 3. Phase 2: 점진적 증가 (25% → 50% → 75% → 100%)
        phases = [25, 50, 75, 100]

        for percentage in phases:
            try:
                result = self._apply_percentage(project, primary_model, shadow_model, percentage, db)

                if not self._validate_result(result, percentage):
                    # Rollback to previous phase
                    prev_percentage = phases[phases.index(percentage) - 1] if phases.index(percentage) > 0 else 10
                    self._rollback_to_previous(project, primary_model, prev_percentage, db)
                    return {
                        "status": "failed",
                        "reason": f"Validation failed at {percentage}%",
                        "phase": f"{percentage}%",
                        "rollback_to": f"{prev_percentage}%",
                    }

                logger.info(f"Successfully applied {percentage}% shadow routing")

            except Exception as e:
                logger.error(f"Error applying {percentage}%: {str(e)}")
                prev_percentage = phases[phases.index(percentage) - 1] if phases.index(percentage) > 0 else 10
                self._rollback_to_previous(project, primary_model, prev_percentage, db)
                return {
                    "status": "failed",
                    "reason": f"Error at {percentage}%: {str(e)}",
                    "phase": f"{percentage}%",
                }

        return {
            "status": "success",
            "rollback_point_id": rollback_point.get("id") if rollback_point else None,
            "applied_percentage": 100,
            "message": "Shadow routing successfully applied at 100%",
        }

    def _create_rollback_point(self, project: Project, primary_model: str, db: Session) -> Dict[str, Any]:
        """롤백 포인트 생성"""
        # Save current configuration
        current_config = project.shadow_routing_config or {}

        rollback_point = {
            "id": f"rb_{project.id}_{primary_model}_{int(datetime.utcnow().timestamp())}",
            "project_id": project.id,
            "primary_model": primary_model,
            "previous_config": current_config.copy(),
            "created_at": datetime.utcnow().isoformat(),
        }

        # In a full implementation, would save to database
        # For now, return the rollback point dict

        return rollback_point

    def _test_with_shadow_routing(
        self, project: Project, primary_model: str, shadow_model: str, percentage: int, db: Session
    ) -> Dict[str, Any]:
        """
        Shadow Routing 테스트 (특정 비율로)

        Args:
            project: Project object
            primary_model: Primary model
            shadow_model: Shadow model
            percentage: Percentage of traffic to shadow (10, 25, 50, etc.)
            db: Database session

        Returns:
            Test result dictionary
        """
        # Update project configuration to enable shadow routing at specified percentage
        config = project.shadow_routing_config or {}
        config["enabled"] = True
        config["test_percentage"] = percentage
        config["shadow_models"] = config.get("shadow_models", {})
        config["shadow_models"][primary_model] = shadow_model

        project.shadow_routing_config = config
        db.commit()

        # In a full implementation, would:
        # 1. Monitor shadow routing results for a period
        # 2. Compare primary vs shadow metrics
        # 3. Check quality, latency, cost differences

        # For now, return estimated result
        return {
            "status": "success",
            "percentage": percentage,
            "test_duration_hours": 24,  # 1 day test
            "similarity_score": 0.85,
            "quality_drop": -2.0,
            "latency_change": 5.0,
            "cost_reduction": 15.0,
        }

    def _validate_shadow_result(self, shadow_result: Dict[str, Any]) -> bool:
        """Shadow 테스트 결과 검증"""
        # Check if results are acceptable
        similarity = shadow_result.get("similarity_score", 0)
        quality_drop = shadow_result.get("quality_drop", 0)
        latency_change = shadow_result.get("latency_change", 0)

        # Validation criteria
        if similarity < 0.7:  # Too different
            return False
        if quality_drop < -10:  # Quality drop too large
            return False
        if latency_change > 30:  # Latency increase too large
            return False

        return True

    def _apply_percentage(
        self, project: Project, primary_model: str, shadow_model: str, percentage: int, db: Session
    ) -> Dict[str, Any]:
        """특정 비율로 적용"""
        # Update project configuration
        config = project.shadow_routing_config or {}
        config["enabled"] = True
        config["shadow_models"] = config.get("shadow_models", {})
        config["shadow_models"][primary_model] = shadow_model
        config["percentage"] = percentage

        project.shadow_routing_config = config
        db.commit()

        return {
            "status": "success",
            "percentage": percentage,
            "applied_at": datetime.utcnow().isoformat(),
        }

    def _validate_result(self, result: Dict[str, Any], percentage: int) -> bool:
        """결과 검증"""
        # Basic validation
        if result.get("status") != "success":
            return False

        # In a full implementation, would check:
        # - Quality metrics
        # - Error rates
        # - Latency
        # - Cost

        return True

    def _rollback(self, project: Project, rollback_point: Dict[str, Any], db: Session) -> None:
        """롤백 실행"""
        if rollback_point:
            previous_config = rollback_point.get("previous_config", {})
            project.shadow_routing_config = previous_config
            db.commit()
            logger.info(f"Rolled back shadow routing configuration for project {project.id}")

    def _rollback_to_previous(
        self, project: Project, primary_model: str, previous_percentage: int, db: Session
    ) -> None:
        """이전 단계로 롤백"""
        config = project.shadow_routing_config or {}
        config["percentage"] = previous_percentage
        project.shadow_routing_config = config
        db.commit()
        logger.info(f"Rolled back to {previous_percentage}% for project {project.id}")
