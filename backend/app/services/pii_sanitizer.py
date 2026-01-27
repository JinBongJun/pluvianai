import re
import json
import time
from typing import Any, Dict, Union, List, Optional
from app.core.logging_config import logger

# Try to import Presidio (optional dependency)
try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
    PRESIDIO_AVAILABLE = True
except ImportError:
    PRESIDIO_AVAILABLE = False
    logger.warning("Presidio not installed. Using regex-only PII sanitization.")


class PIISanitizer:
    """Service for masking sensitive information in LLM payloads with 2-stage processing"""

    # Common patterns for sensitive data (Stage 1: Fast Regex)
    PATTERNS = {
        "email": r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
        "openai_key": r"sk-[a-zA-Z0-9]{32,}",
        "anthropic_key": r"sk-ant-[a-zA-Z0-9-]{32,}",
        "google_key": r"AIza[a-zA-Z0-9_-]{35}",
        "phone": r"\b(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b",
        "credit_card": r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    }

    def __init__(self, use_presidio: bool = True, timeout_ms: int = 100):
        self._compiled_patterns = {name: re.compile(pattern) for name, pattern in self.PATTERNS.items()}
        self.use_presidio = use_presidio and PRESIDIO_AVAILABLE
        self.timeout_ms = timeout_ms
        
        # Initialize Presidio (Stage 2: Accurate NLP)
        if self.use_presidio:
            try:
                self.analyzer = AnalyzerEngine()
                self.anonymizer = AnonymizerEngine()
            except Exception as e:
                logger.warning(f"Failed to initialize Presidio: {str(e)}. Falling back to regex-only.")
                self.use_presidio = False

    def sanitize(self, data: Union[str, Dict, List], project_id: Optional[int] = None) -> Any:
        """
        Recursively sanitize data by masking sensitive patterns.
        2-stage processing: Regex (fast) → Presidio (accurate)
        """
        if isinstance(data, str):
            return self._sanitize_string(data, project_id)
        
        elif isinstance(data, dict):
            return {k: self.sanitize(v, project_id) for k, v in data.items()}
        
        elif isinstance(data, list):
            return [self.sanitize(item, project_id) for item in data]
        
        return data

    def _sanitize_string(self, text: str, project_id: Optional[int] = None) -> str:
        """
        Sanitize a string with 2-stage processing
        Stage 1: Regex (fast, < 10ms target)
        Stage 2: Presidio NLP (accurate, < 40ms target)
        """
        if not text:
            return text

        start_time = time.time() * 1000  # milliseconds
        
        # Stage 1: Fast Regex filtering
        sanitized = text
        for name, pattern in self._compiled_patterns.items():
            sanitized = pattern.sub(f"[MASKED_{name.upper()}]", sanitized)
        
        regex_time = (time.time() * 1000) - start_time
        
        # Stage 2: Presidio NLP (if enabled and within timeout)
        if self.use_presidio and (time.time() * 1000 - start_time) < self.timeout_ms:
            try:
                # Analyze with Presidio
                analyzer_results = self.analyzer.analyze(
                    text=sanitized,
                    language="en",
                    entities=["EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD", "SSN", "PERSON", "LOCATION"],
                )
                
                # Anonymize detected entities
                if analyzer_results:
                    anonymized = self.anonymizer.anonymize(
                        text=sanitized,
                        analyzer_results=analyzer_results,
                        operators={"DEFAULT": {"type": "replace", "new_value": "[REDACTED]"}},
                    )
                    sanitized = anonymized.text
                
                total_time = (time.time() * 1000) - start_time
                if total_time > self.timeout_ms:
                    logger.warning(f"PII sanitization exceeded timeout: {total_time}ms > {self.timeout_ms}ms")
            except Exception as e:
                logger.warning(f"Presidio sanitization failed: {str(e)}. Using regex-only result.")
        
        return sanitized

    def sanitize_payload(self, payload: Dict[str, Any], project_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Specific logic for sanitizing LLM payloads (messages, system prompt, etc.)
        """
        return self.sanitize(payload, project_id)

    def add_custom_pattern(self, name: str, pattern: str, project_id: Optional[int] = None):
        """
        Add custom PII pattern for a project
        Note: For MVP, patterns are stored in memory. In production, store in DB.
        """
        self._compiled_patterns[name] = re.compile(pattern)
        logger.info(f"Added custom PII pattern '{name}' for project {project_id}")
