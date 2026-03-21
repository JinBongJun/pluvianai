"""
Pricing updater service for model pricing information

Pricing is maintained manually and updated periodically.
This service provides a simple interface for accessing pricing data.
"""

from typing import Dict, Any
from datetime import datetime, timezone
from app.core.logging_config import logger


class PricingUpdater:
    """Service for updating model pricing information"""

    # Base pricing (as of 2024-01-01)
    # This should be updated periodically or fetched from provider APIs
    BASE_PRICING = {
        "openai": {
            "gpt-4": {"input": 30.0, "output": 60.0},
            "gpt-4-turbo": {"input": 10.0, "output": 30.0},
            "gpt-4-turbo-preview": {"input": 10.0, "output": 30.0},
            "gpt-4-0125-preview": {"input": 10.0, "output": 30.0},
            "gpt-4-32k": {"input": 60.0, "output": 120.0},
            "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
            "gpt-3.5-turbo-16k": {"input": 3.0, "output": 4.0},
            "o1-preview": {"input": 15.0, "output": 60.0},
            "o1-mini": {"input": 3.0, "output": 12.0},
        },
        "anthropic": {
            "claude-3-opus": {"input": 15.0, "output": 75.0},
            "claude-3-sonnet": {"input": 3.0, "output": 15.0},
            "claude-3-haiku": {"input": 0.25, "output": 1.25},
            "claude-2": {"input": 8.0, "output": 24.0},
            "claude-2.1": {"input": 8.0, "output": 24.0},
        },
        "google": {
            "gemini-pro": {"input": 0.5, "output": 1.5},
            "gemini-pro-vision": {"input": 0.25, "output": 1.0},
            "gemini-ultra": {"input": 7.0, "output": 21.0},
            "palm-2": {"input": 0.5, "output": 1.5},
        },
        # Additional providers (extendable)
        "cohere": {
            "command": {"input": 1.0, "output": 2.0},
            "command-light": {"input": 0.5, "output": 1.0},
            "command-r": {"input": 0.5, "output": 1.5},
        },
        "mistral": {
            "mistral-large": {"input": 2.0, "output": 6.0},
            "mistral-medium": {"input": 2.7, "output": 8.1},
            "mistral-small": {"input": 0.2, "output": 0.6},
            "mixtral-8x7b": {"input": 0.24, "output": 0.24},
            "codestral": {"input": 0.2, "output": 0.8},
        },
        "perplexity": {
            "pplx-online": {"input": 0.0, "output": 1.0},  # Input free, output charged
            "pplx-offline": {"input": 0.5, "output": 0.5},
            "sonar": {"input": 0.0, "output": 1.0},
        },
        "together": {
            # Together hosts many models, pricing varies
            "meta-llama/Llama-2-70b-chat-hf": {"input": 0.7, "output": 0.8},
            "meta-llama/Llama-2-13b-chat-hf": {"input": 0.225, "output": 0.225},
            # Default for Together models
            "default": {"input": 0.5, "output": 0.5},
        },
        "groq": {
            # Groq typically offers fast inference
            "llama2-70b-4096": {"input": 0.59, "output": 0.79},
            "mixtral-8x7b-32768": {"input": 0.24, "output": 0.24},
            "default": {"input": 0.5, "output": 0.5},
        },
        "fireworks": {
            # Fireworks AI pricing
            "default": {"input": 0.5, "output": 0.5},
        },
        # Unknown provider default pricing
        "unknown": {
            "default": {"input": 1.0, "output": 2.0},
        },
    }

    def __init__(self) -> None:
        """Initialize pricing updater with base pricing data."""
        self.pricing = self.BASE_PRICING.copy()
        self.last_updated = datetime.now(timezone.utc)

    def get_pricing(self) -> Dict[str, Dict[str, Dict[str, float]]]:
        """
        Get current pricing for all providers and models.
        
        Returns:
            Nested dict: {provider: {model: {input: float, output: float}}}
        """
        return self.pricing

    def update_pricing(
        self,
        provider: str,
        model: str,
        input_price: float,
        output_price: float
    ) -> None:
        """
        Update pricing for a specific model.
        
        Args:
            provider: Provider name (e.g., 'openai', 'anthropic')
            model: Model name (e.g., 'gpt-4-turbo', 'claude-3-sonnet')
            input_price: Input price per 1M tokens
            output_price: Output price per 1M tokens
        """
        if provider not in self.pricing:
            self.pricing[provider] = {}

        self.pricing[provider][model] = {"input": input_price, "output": output_price}
        self.last_updated = datetime.now(timezone.utc)
        logger.info(
            f"Updated pricing for {provider}/{model}: ${input_price}/${output_price} per 1M tokens"
        )

    def get_model_pricing(self, provider: str, model: str) -> Dict[str, float]:
        """
        Get pricing for a specific model.
        
        Args:
            provider: Provider name
            model: Model name
            
        Returns:
            Dict with 'input' and 'output' prices per 1M tokens
            Returns default pricing if model not found
        """
        provider_pricing = self.pricing.get(provider, {})
        model_pricing = provider_pricing.get(model)

        if not model_pricing:
            logger.warning(f"Pricing not found for {provider}/{model}, using defaults")
            return {"input": 1.0, "output": 2.0}

        return model_pricing


# Global instance
pricing_updater = PricingUpdater()
