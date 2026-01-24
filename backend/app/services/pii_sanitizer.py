import re
import json
from typing import Any, Dict, Union, List

class PIISanitizer:
    """Service for masking sensitive information in LLM payloads"""

    # Common patterns for sensitive data
    PATTERNS = {
        "email": r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
        "openai_key": r"sk-[a-zA-Z0-9]{32,}",
        "anthropic_key": r"sk-ant-[a-zA-Z0-9-]{32,}",
        "google_key": r"AIza[a-zA-Z0-9_-]{35}",
        "phone": r"\b(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b",
        # Generic sensitive patterns can be added here
    }

    def __init__(self):
        self._compiled_patterns = {name: re.compile(pattern) for name, pattern in self.PATTERNS.items()}

    def sanitize(self, data: Union[str, Dict, List]) -> Any:
        """
        Recursively sanitize data by masking sensitive patterns.
        """
        if isinstance(data, str):
            sanitized_str = data
            for name, pattern in self._compiled_patterns.items():
                sanitized_str = pattern.sub(f"[MASKED_{name.upper()}]", sanitized_str)
            return sanitized_str
        
        elif isinstance(data, dict):
            return {k: self.sanitize(v) for k, v in data.items()}
        
        elif isinstance(data, list):
            return [self.sanitize(item) for item in data]
        
        return data

    def sanitize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Specific logic for sanitizing LLM payloads (messages, system prompt, etc.)
        """
        return self.sanitize(payload)
