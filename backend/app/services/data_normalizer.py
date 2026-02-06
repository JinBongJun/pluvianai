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
        # Additional providers (extendable)
        "cohere": [
            r"api\.cohere\.ai",
            r"cohere\.com",
        ],
        "mistral": [
            r"api\.mistral\.ai",
            r"mistral\.ai",
        ],
        "huggingface": [
            r"api-inference\.huggingface\.co",
            r"huggingface\.co",
        ],
        "perplexity": [
            r"api\.perplexity\.ai",
            r"perplexity\.ai",
        ],
        "together": [
            r"api\.together\.xyz",
            r"together\.ai",
        ],
        "groq": [
            r"api\.groq\.com",
            r"groq\.com",
        ],
        "fireworks": [
            r"api\.fireworks\.ai",
            r"fireworks\.ai",
        ],
    }

    def normalize(
        self, request_data: Optional[Dict[str, Any]], response_data: Optional[Dict[str, Any]], url: str = ""
    ) -> Dict[str, Any]:
        """
        Normalize request/response data and extract key information

        Args:
            request_data: Request payload
            response_data: Response payload
            url: Optional URL (for proxy mode, empty string for SDK direct mode)

        Returns:
            Dictionary with normalized data:
            - provider: str
            - model: str
            - request_prompt: str
            - request_tokens: int
            - response_tokens: int
            - response_text: str (optional)
        """
        # Extract model first (needed for provider detection)
        model = self._extract_model(request_data, response_data)

        # Detect provider from URL or model name
        provider = self._detect_provider(url) if url else self._detect_provider_from_model(model)

        result = {
            "provider": provider,
            "model": model,
            "system_prompt": self._extract_system_prompt(request_data),
            "request_prompt": self._extract_prompt(request_data),
            "request_tokens": self._extract_request_tokens(request_data, response_data),
            "response_tokens": self._extract_response_tokens(response_data),
            "response_text": self._extract_response_text(response_data),
        }

        return result

    def _extract_system_prompt(self, request_data: Optional[Dict]) -> Optional[str]:
        """Extract system prompt from request messages (for Live View / Snapshot)."""
        if not request_data or "messages" not in request_data:
            return None
        messages = request_data["messages"]
        if not isinstance(messages, list):
            return None
        for msg in messages:
            if isinstance(msg, dict) and msg.get("role") == "system":
                content = msg.get("content", "")
                if isinstance(content, str):
                    return content if content.strip() else None
                if isinstance(content, list):
                    text_parts = [
                        c.get("text", "") for c in content
                        if isinstance(c, dict) and c.get("type") == "text"
                    ]
                    joined = " ".join(text_parts).strip() if text_parts else ""
                    return joined or None
        return None

    def _detect_provider(self, url: str) -> str:
        """Detect LLM provider from URL"""
        if not url:
            return "unknown"

        url_lower = url.lower()

        for provider, patterns in self.PROVIDER_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, url_lower):
                    return provider

        return "unknown"

    def _detect_provider_from_model(self, model: str) -> str:
        """Detect provider from model name"""
        if not model or model == "unknown":
            return "unknown"

        model_lower = model.lower()

        # OpenAI models
        if any(
            pattern in model_lower
            for pattern in ["gpt", "o1", "o3", "text-", "davinci", "curie", "babbage", "ada", "whisper"]
        ):
            return "openai"

        # Anthropic models
        if any(pattern in model_lower for pattern in ["claude", "sonnet", "opus", "haiku"]):
            return "anthropic"

        # Google models
        if any(pattern in model_lower for pattern in ["gemini", "palm", "bison", "imagen"]):
            return "google"

        # Cohere models
        if any(pattern in model_lower for pattern in ["cohere", "command", "embed"]):
            return "cohere"

        # Mistral models
        if any(pattern in model_lower for pattern in ["mistral", "mixtral", "codestral"]):
            return "mistral"

        # HuggingFace models
        if any(pattern in model_lower for pattern in ["meta-llama", "falcon", "mistral", "zephyr", "flan"]):
            # Check if it's specifically a HuggingFace model (often has organization prefix)
            if "/" in model and any(pattern in model_lower for pattern in ["huggingface", "hf", "meta"]):
                return "huggingface"

        # Perplexity models
        if any(pattern in model_lower for pattern in ["pplx", "perplexity", "sonar"]):
            return "perplexity"

        # Together AI models
        if any(pattern in model_lower for pattern in ["together", "meta-llama"]):
            # Check context - Together often hosts Llama models
            if "together" in model_lower:
                return "together"

        # Groq models
        if any(pattern in model_lower for pattern in ["groq", "llama", "mixtral"]) and "groq" in model_lower:
            return "groq"

        # Fireworks models
        if any(pattern in model_lower for pattern in ["fireworks", "fw-"]):
            return "fireworks"

        # Default to unknown (will still work, but cost calculation may be approximate)
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
                            text_parts = [
                                c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"
                            ]
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
                        text_parts = [
                            c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"
                        ]
                        return " ".join(text_parts) if text_parts else None

        # Direct prompt field
        if "prompt" in request_data:
            prompt = request_data["prompt"]
            if isinstance(prompt, str):
                return prompt

        return None

    def _extract_request_tokens(
        self, request_data: Optional[Dict], response_data: Optional[Dict] = None
    ) -> Optional[int]:
        """Extract request token count from request or response"""
        # Try response first (more accurate)
        if response_data and "usage" in response_data and isinstance(response_data["usage"], dict):
            # OpenAI format
            if "prompt_tokens" in response_data["usage"]:
                return response_data["usage"].get("prompt_tokens")
            # Anthropic format
            if "input_tokens" in response_data["usage"]:
                return response_data["usage"].get("input_tokens")

        # Fallback to request
        if request_data and "usage" in request_data and isinstance(request_data["usage"], dict):
            return request_data["usage"].get("prompt_tokens")

        return None

    def _extract_response_tokens(self, response_data: Optional[Dict]) -> Optional[int]:
        """Extract response token count"""
        if not response_data:
            return None

        # OpenAI format
        if "usage" in response_data and isinstance(response_data["usage"], dict):
            # Check completion_tokens first (OpenAI)
            if "completion_tokens" in response_data["usage"]:
                return response_data["usage"].get("completion_tokens")
            # Check output_tokens (Anthropic)
            if "output_tokens" in response_data["usage"]:
                return response_data["usage"].get("output_tokens")

        return None

    def _extract_response_text(self, response_data: Optional[Dict]) -> Optional[str]:
        """Extract response text from response data"""
        if not response_data:
            return None

        # OpenAI format
        if "choices" in response_data and isinstance(response_data["choices"], list):
            if len(response_data["choices"]) > 0:
                choice = response_data["choices"][0]
                if "message" in choice and isinstance(choice["message"], dict):
                    content = choice["message"].get("content", "")
                    if isinstance(content, str):
                        return content

        # Anthropic format
        if "content" in response_data:
            content = response_data["content"]
            if isinstance(content, list) and len(content) > 0:
                # Get text from first content block
                first_block = content[0]
                if isinstance(first_block, dict) and first_block.get("type") == "text":
                    return first_block.get("text", "")

        # Direct text field
        if "text" in response_data:
            return response_data["text"]

        return None
