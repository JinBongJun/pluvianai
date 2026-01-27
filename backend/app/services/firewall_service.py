"""
Firewall Service for Production Guard
Real-time scanning of streaming responses to block dangerous content
"""

import re
import asyncio
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models.firewall_rule import FirewallRule, FirewallRuleType, FirewallAction, FirewallSeverity
from app.services.pii_sanitizer import PIISanitizer
from app.services.cache_service import cache_service
from app.core.logging_config import logger


class FirewallService:
    """Service for real-time firewall scanning of LLM responses"""

    def __init__(self):
        self.pii_sanitizer = PIISanitizer(use_presidio=True, timeout_ms=100)
        # Cache for compiled regex patterns
        self._pattern_cache: Dict[int, List[re.Pattern]] = {}

    def get_project_firewall_rules(self, project_id: int, db: Session) -> List[FirewallRule]:
        """
        Get all enabled firewall rules for a project
        
        Args:
            project_id: Project ID
            db: Database session
            
        Returns:
            List of enabled firewall rules
        """
        return (
            db.query(FirewallRule)
            .filter(
                FirewallRule.project_id == project_id,
                FirewallRule.enabled == True
            )
            .all()
        )

    async def check_global_panic_mode(self) -> bool:
        """
        Check if global panic mode is active (Redis-based)
        
        Returns:
            True if panic mode is active
        """
        if not cache_service.enabled:
            return False
        
        try:
            is_panic = cache_service.redis_client.get("firewall:global:panic_mode")
            return is_panic == "1" or is_panic == b"1"
        except Exception as e:
            logger.warning(f"Failed to check panic mode: {str(e)}")
            return False

    async def scan_streaming_response(
        self,
        response_chunk: str,
        project_id: int,
        rules: List[FirewallRule],
        accumulated_text: str = ""
    ) -> Dict[str, Any]:
        """
        Scan a streaming response chunk for dangerous content
        
        Args:
            response_chunk: Current chunk of streaming response
            project_id: Project ID
            rules: List of firewall rules to apply
            accumulated_text: Accumulated text from previous chunks (for context)
            
        Returns:
            Dict with:
                - blocked: bool - Whether to block the response
                - reason: str - Reason for blocking
                - severity: str - Severity level
                - rule_id: int - ID of the rule that triggered
        """
        # Check global panic mode first
        if await self.check_global_panic_mode():
            return {
                "blocked": True,
                "reason": "Global panic mode is active",
                "severity": "critical",
                "rule_id": None
            }

        # Combine accumulated text with new chunk for context
        full_text = accumulated_text + response_chunk

        # Run all rule checks in parallel for performance
        tasks = []
        for rule in rules:
            tasks.append(self._check_rule(rule, response_chunk, full_text))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Find the highest severity blocking rule
        blocking_result = None
        highest_severity = None
        severity_order = {"low": 1, "medium": 2, "high": 3, "critical": 4}

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(f"Rule check failed for rule {rules[i].id}: {str(result)}")
                continue

            if result and result.get("matched"):
                rule = rules[i]
                # Only consider blocking rules
                if rule.action == FirewallAction.BLOCK:
                    severity_value = severity_order.get(rule.severity.value, 0)
                    if highest_severity is None or severity_value > severity_order.get(highest_severity, 0):
                        highest_severity = rule.severity.value
                        blocking_result = {
                            "blocked": True,
                            "reason": result.get("reason", f"Rule '{rule.name}' triggered"),
                            "severity": rule.severity.value,
                            "rule_id": rule.id,
                            "rule_name": rule.name
                        }

        if blocking_result:
            return blocking_result

        # No blocking rules matched
        return {
            "blocked": False,
            "reason": None,
            "severity": None,
            "rule_id": None
        }

    async def _check_rule(
        self,
        rule: FirewallRule,
        chunk: str,
        full_text: str
    ) -> Optional[Dict[str, Any]]:
        """
        Check a single firewall rule against the response
        
        Args:
            rule: Firewall rule to check
            chunk: Current chunk
            full_text: Full accumulated text
            
        Returns:
            Dict with "matched" and "reason" if rule matches, None otherwise
        """
        try:
            # Rule type specific checks
            if rule.rule_type == FirewallRuleType.PII:
                return await self._check_pii(rule, chunk, full_text)
            elif rule.rule_type == FirewallRuleType.TOXICITY:
                return await self._check_toxicity(rule, chunk, full_text)
            elif rule.rule_type == FirewallRuleType.HALLUCINATION:
                return await self._check_hallucination(rule, chunk, full_text)
            elif rule.rule_type == FirewallRuleType.CUSTOM:
                return await self._check_custom_pattern(rule, chunk, full_text)
        except Exception as e:
            logger.warning(f"Error checking rule {rule.id}: {str(e)}")
            return None

        return None

    async def _check_pii(
        self,
        rule: FirewallRule,
        chunk: str,
        full_text: str
    ) -> Optional[Dict[str, Any]]:
        """Check for PII using PIISanitizer"""
        # Use PIISanitizer to detect PII
        # For performance, we check the chunk first, then full text if needed
        text_to_check = chunk if len(chunk) > 100 else full_text
        
        # Quick regex check first
        if rule.pattern:
            try:
                pattern = re.compile(rule.pattern, re.IGNORECASE)
                if pattern.search(text_to_check):
                    return {
                        "matched": True,
                        "reason": f"PII pattern detected: {rule.name}"
                    }
            except re.error:
                logger.warning(f"Invalid regex pattern in rule {rule.id}")

        # Use PIISanitizer for comprehensive PII detection
        try:
            # Check if PII sanitizer would modify the text (indicating PII found)
            sanitized = self.pii_sanitizer.sanitize(text_to_check)
            if sanitized != text_to_check:
                return {
                    "matched": True,
                    "reason": f"PII detected: {rule.name}"
                }
        except Exception as e:
            logger.warning(f"PII check failed: {str(e)}")

        return None

    async def _check_toxicity(
        self,
        rule: FirewallRule,
        chunk: str,
        full_text: str
    ) -> Optional[Dict[str, Any]]:
        """
        Check for toxic content using OpenAI Moderation API with pattern matching fallback.
        
        Args:
            rule: Firewall rule to check against
            chunk: Current response chunk
            full_text: Accumulated full response text
            
        Returns:
            Dict with match information if toxic content detected, None otherwise
        """
        import httpx
        from app.core.config import settings
        
        # Try OpenAI Moderation API first if API key is available
        if settings.OPENAI_API_KEY and len(full_text) > 10:  # Skip API call for very short text
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                    response = await client.post(
                        "https://api.openai.com/v1/moderations",
                        headers={
                            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                            "Content-Type": "application/json"
                        },
                        json={"input": full_text[:2000]}  # Limit to 2000 chars for API efficiency
                    )
                    response.raise_for_status()
                    moderation_result = response.json()
                    
                    results = moderation_result.get("results", [])
                    if results and results[0].get("flagged", False):
                        result = results[0]
                        flagged_categories = [
                            cat for cat, flagged in result.get("categories", {}).items()
                            if flagged
                        ]
                        return {
                            "matched": True,
                            "reason": f"Toxic content detected by OpenAI Moderation: {', '.join(flagged_categories)}",
                            "categories": flagged_categories,
                            "scores": result.get("category_scores", {})
                        }
            except httpx.RequestError:
                logger.debug("OpenAI Moderation API unavailable, using pattern matching fallback")
            except Exception as e:
                logger.warning(f"OpenAI Moderation API error: {str(e)}, using pattern matching fallback")
        
        # Fallback to pattern matching if API is unavailable or fails
        if rule.pattern:
            try:
                if re.search(rule.pattern, full_text, re.IGNORECASE):
                    return {
                        "matched": True,
                        "reason": f"Toxicity pattern detected: {rule.name}"
                    }
            except re.error:
                logger.warning(f"Invalid regex pattern in rule {rule.id}")

        # Default toxicity keywords (can be overridden by rule.pattern)
        default_toxicity_patterns = [
            r"\b(hate|violence|harm|kill|murder|suicide)\b",
        ]
        
        for pattern_str in default_toxicity_patterns:
            try:
                if re.search(pattern_str, full_text, re.IGNORECASE):
                    return {
                        "matched": True,
                        "reason": f"Toxic content detected: {rule.name}"
                    }
            except re.error:
                continue

        return None

    async def _check_hallucination(
        self,
        rule: FirewallRule,
        chunk: str,
        full_text: str
    ) -> Optional[Dict[str, Any]]:
        """
        Check for hallucination indicators using LLM-based detection with pattern fallback.
        
        Hallucination detection checks if the response contains:
        - Unverifiable claims
        - Contradictory statements
        - Facts stated without evidence
        
        Args:
            rule: Firewall rule to check against
            chunk: Current response chunk
            full_text: Accumulated full response text
            
        Returns:
            Dict with match information if hallucination detected, None otherwise
        """
        import json
        import httpx
        from app.core.config import settings
        
        # Try LLM-based detection if OpenAI API key is available
        if settings.OPENAI_API_KEY and len(full_text) > 50:
            try:
                hallucination_prompt = (
                    "Analyze the following AI response for potential hallucinations "
                    "(false or unverifiable claims).\n\n"
                    f"Response to analyze:\n{full_text[:2000]}\n\n"
                    "Check for:\n"
                    "1. Unverifiable factual claims\n"
                    "2. Contradictory statements\n"
                    "3. Claims made without evidence\n"
                    "4. Overly confident statements about uncertain facts\n\n"
                    'Respond with JSON only: {"is_hallucination": true/false, '
                    '"confidence": 0.0-1.0, "reason": "brief explanation"}'
                )

                async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                    response = await client.post(
                        "https://api.openai.com/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": "gpt-4o-mini",
                            "messages": [
                                {
                                    "role": "system",
                                    "content": "You are an expert at detecting AI hallucinations. Respond only with valid JSON."
                                },
                                {"role": "user", "content": hallucination_prompt}
                            ],
                            "response_format": {"type": "json_object"},
                            "temperature": 0.3
                        }
                    )
                    response.raise_for_status()
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]
                    detection_result = json.loads(content)
                    
                    if detection_result.get("is_hallucination", False):
                        confidence = detection_result.get("confidence", 0.5)
                        if confidence > 0.7:
                            return {
                                "matched": True,
                                "reason": f"Hallucination detected: {detection_result.get('reason', 'Unverifiable claims detected')}",
                                "confidence": confidence
                            }
            except httpx.RequestError:
                logger.debug("LLM hallucination detection API unavailable, using pattern matching fallback")
            except json.JSONDecodeError:
                logger.debug("Failed to parse LLM hallucination detection response, using pattern matching fallback")
            except Exception as e:
                logger.warning(f"LLM hallucination detection error: {str(e)}, using pattern matching fallback")
        
        # Fallback to pattern-based heuristics
        hallucination_patterns = [
            r"\b(according to sources|studies show|research indicates)\b.*\b(but|however|actually)\b",
            r"\b(I cannot|I don't have|I'm not able to)\b.*\b(but|however|actually)\b",
        ]
        
        # Check custom rule pattern
        if rule.pattern:
            try:
                pattern = re.compile(rule.pattern, re.IGNORECASE)
                if pattern.search(full_text):
                    return {
                        "matched": True,
                        "reason": f"Hallucination pattern detected: {rule.name}"
                    }
            except re.error:
                logger.warning(f"Invalid regex pattern in rule {rule.id}")
        
        # Check default patterns
        for pattern_str in hallucination_patterns:
            try:
                if re.search(pattern_str, full_text, re.IGNORECASE):
                    return {
                        "matched": True,
                        "reason": f"Hallucination pattern detected: {rule.name}"
                    }
            except re.error:
                continue

        return None

    async def _check_custom_pattern(
        self,
        rule: FirewallRule,
        chunk: str,
        full_text: str
    ) -> Optional[Dict[str, Any]]:
        """Check custom pattern"""
        if not rule.pattern:
            return None

        try:
            pattern = re.compile(rule.pattern, re.IGNORECASE)
            if pattern.search(full_text):
                return {
                    "matched": True,
                    "reason": f"Custom pattern matched: {rule.name}"
                }
        except re.error as e:
            logger.warning(f"Invalid regex pattern in rule {rule.id}: {str(e)}")

        return None

    def set_global_panic_mode(self, enabled: bool) -> bool:
        """
        Set global panic mode (Redis-based)
        
        Args:
            enabled: Whether to enable panic mode
            
        Returns:
            True if successful
        """
        if not cache_service.enabled:
            return False

        try:
            if enabled:
                cache_service.redis_client.set("firewall:global:panic_mode", "1", ex=3600)  # 1 hour TTL
            else:
                cache_service.redis_client.delete("firewall:global:panic_mode")
            return True
        except Exception as e:
            logger.error(f"Failed to set panic mode: {str(e)}")
            return False


# Singleton instance
firewall_service = FirewallService()
