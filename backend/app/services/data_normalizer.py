"""
Data normalizer for LLM API requests/responses
"""
import re
from typing import Dict, Any, Optional


class DataNormalizer:
    """Normalize LLM API request/response data"""
    
    # Provider URL patterns
    PROVIDER_PATTERNS = {
        "openai": [
            r"api\.openai\.com",
            r"openai\.com",
        ],
        "anthropic": [
            r"api\.anthropic\.com",
            r"anthropic\.com",
        ],
        "google": [
            r"generativelanguage\.googleapis\.com",
            r"ai\.googleapis\.com",
            r"google\.com",
        ],
    }
    
    def normalize(
        self,
        request_data: Optional[Dict[str, Any]],
        response_data: Optional[Dict[str, Any]],
        url: str
    ) -> Dict[str, Any]:
        """
        Normalize request/response data and extract key information
        
        Returns:
            Dictionary with normalized data:
            - provider: str
            - model: str
            - request_prompt: str
            - request_tokens: int
            - response_tokens: int
        """
        result = {
            "provider": self._detect_provider(url),
            "model": self._extract_model(request_data, response_data),
            "request_prompt": self._extract_prompt(request_data),
            "request_tokens": self._extract_request_tokens(request_data),
            "response_tokens": self._extract_response_tokens(response_data),
        }
        
        return result
    
    def _detect_provider(self, url: str) -> str:
        """Detect LLM provider from URL"""
        url_lower = url.lower()
        
        for provider, patterns in self.PROVIDER_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, url_lower):
                    return provider
        
        return "unknown"
    
    def _extract_model(self, request_data: Optional[Dict], response_data: Optional[Dict]) -> str:
        """Extract model name from request or response"""
        if request_data:
            # OpenAI format
            if "model" in request_data:
                return str(request_data["model"])
            # Anthropic format
            if "model" in request_data:
                return str(request_data["model"])
        
        if response_data:
            # Check response for model info
            if "model" in response_data:
                return str(response_data["model"])
            if "id" in response_data:
                # Sometimes model is in id field
                return str(response_data["id"])
        
        return "unknown"
    
    def _extract_prompt(self, request_data: Optional[Dict]) -> Optional[str]:
        """Extract prompt text from request"""
        if not request_data:
            return None
        
        # OpenAI format
        if "messages" in request_data:
            messages = request_data["messages"]
            if isinstance(messages, list) and len(messages) > 0:
                # Get the last user message
                for msg in reversed(messages):
                    if isinstance(msg, dict) and msg.get("role") == "user":
                        content = msg.get("content", "")
                        if isinstance(content, str):
                            return content
                        elif isinstance(content, list):
                            # Handle multimodal content
                            text_parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
                            return " ".join(text_parts) if text_parts else None
        
        # Anthropic format
        if "messages" in request_data:
            messages = request_data["messages"]
            if isinstance(messages, list) and len(messages) > 0:
                last_msg = messages[-1]
                if isinstance(last_msg, dict) and last_msg.get("role") == "user":
                    content = last_msg.get("content", "")
                    if isinstance(content, str):
                        return content
                    elif isinstance(content, list):
                        text_parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
                        return " ".join(text_parts) if text_parts else None
        
        # Direct prompt field
        if "prompt" in request_data:
            prompt = request_data["prompt"]
            if isinstance(prompt, str):
                return prompt
        
        return None
    
    def _extract_request_tokens(self, request_data: Optional[Dict]) -> Optional[int]:
        """Extract request token count"""
        if not request_data:
            return None
        
        # Some APIs return usage in request
        if "usage" in request_data and isinstance(request_data["usage"], dict):
            return request_data["usage"].get("prompt_tokens")
        
        return None
    
    def _extract_response_tokens(self, response_data: Optional[Dict]) -> Optional[int]:
        """Extract response token count"""
        if not response_data:
            return None
        
        # OpenAI format
        if "usage" in response_data and isinstance(response_data["usage"], dict):
            return response_data["usage"].get("completion_tokens")
        
        # Anthropic format
        if "usage" in response_data and isinstance(response_data["usage"], dict):
            return response_data["usage"].get("output_tokens")
        
        return None



