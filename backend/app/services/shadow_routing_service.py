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
    
    def get_shadow_model(
        self,
        project: Project,
        primary_model: str
    ) -> Optional[str]:
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
    
    def get_recommended_shadow_models(
        self,
        primary_model: str
    ) -> List[str]:
        """
        Get recommended shadow models for a primary model
        
        Args:
            primary_model: Primary model name (e.g., "gpt-4")
        
        Returns:
            List of recommended shadow model names
        """
        return self.RECOMMENDED_SHADOW_MODELS.get(primary_model, [])
    
    async def make_shadow_call(
        self,
        provider: str,
        shadow_model: str,
        request_data: Dict[str, Any],
        api_key: str
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
                response = await client.post(
                    url=target_url,
                    headers=headers,
                    json=request_payload
                )
                
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
        provider: str
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
    
    def _extract_response_text(
        self,
        response_data: Dict[str, Any],
        provider: str
    ) -> str:
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
    
    def _extract_tokens(
        self,
        response_data: Dict[str, Any],
        provider: str
    ) -> Dict[str, int]:
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
    
    def _calculate_similarity(
        self,
        text1: str,
        text2: str
    ) -> float:
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
        self,
        project: Project,
        primary_api_call: APICall,
        request_data: Dict[str, Any],
        api_key: str,
        db: Session
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
            provider=primary_api_call.provider,
            shadow_model=shadow_model,
            request_data=request_data,
            api_key=api_key
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
            chain_id=primary_api_call.chain_id
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
            provider=primary_api_call.provider
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
            difference_details=comparison_result
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
                notification_channels=["email"]
            )
            db.add(alert)
            db.flush()  # Get alert.id
            
            comparison.alert_id = alert.id
            comparison.alert_sent = True
        
        db.commit()
        db.refresh(comparison)
        
        return comparison
