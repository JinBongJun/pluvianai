"""
Signal Detection Service - Signal-based detection for LLM responses

Detects:
- Hallucination
- Answer length changes
- Refusal increases
- JSON schema breaks
- Latency spikes
- Tool misuse
- Custom signals
"""

import json
import re
from typing import Dict, Any, List, Optional
from types import SimpleNamespace
from sqlalchemy.orm import Session
from app.core.logging_config import logger


class SignalDetectionService:
    """Service for detecting signals in LLM responses"""
    
    # Default thresholds / params for zero-config
    DEFAULT_PARAMS = {
        "length_change": {"threshold_ratio": 0.3},  # 30% change
        "latency_limit": {"limit_ms": 2000},
        "token_limit": {"limit_tokens": 4000},
        "cost_limit": {"limit_cost": 0.5},
        "json_schema": {"required": []},
    }

    DEFAULT_SIGNAL_CONFIGS = [
        {"signal_type": "length_change", "name": "Length Change", "params": DEFAULT_PARAMS["length_change"], "severity": "medium", "enabled": True},
        {"signal_type": "latency_limit", "name": "Latency Limit", "params": DEFAULT_PARAMS["latency_limit"], "severity": "medium", "enabled": True},
        {"signal_type": "token_limit", "name": "Token Limit", "params": DEFAULT_PARAMS["token_limit"], "severity": "medium", "enabled": True},
        {"signal_type": "cost_limit", "name": "Cost Limit", "params": DEFAULT_PARAMS["cost_limit"], "severity": "medium", "enabled": True},
        {"signal_type": "json_schema", "name": "JSON Schema", "params": DEFAULT_PARAMS["json_schema"], "severity": "high", "enabled": True},
    ]

    DEFAULT_THRESHOLDS = {
        "hallucination": 0.7,
        "refusal_increase": 0.2,
        "length_change": 0.3,
        "latency_limit": 2.0,
        "token_limit": 1.0,
        "cost_limit": 1.0,
    }
    
    # Refusal patterns
    REFUSAL_PATTERNS = [
        r"i cannot",
        r"i can't",
        r"i'm unable to",
        r"i am unable to",
        r"i'm not able to",
        r"i am not able to",
        r"sorry, but i",
        r"i apologize, but",
        r"as an ai",
        r"i don't have the ability",
        r"i do not have the ability",
        r"that's not something i can",
        r"that is not something i can",
    ]
    
    def __init__(self, db: Session):
        self.db = db
    
    def _get_models(self):
        """Lazy import models to avoid circular imports"""
        from app.models.signal_detection import SignalDetection, SignalConfig
        return SignalDetection, SignalConfig
    
    def detect_all_signals(
        self,
        project_id: int,
        response_text: str,
        request_data: Optional[Dict] = None,
        response_data: Optional[Dict] = None,
        baseline_data: Optional[Dict] = None,
        snapshot_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Run all signal detections on a response
        
        Args:
            project_id: Project ID
            response_text: The LLM response text
            request_data: Original request data
            response_data: Full response data
            baseline_data: Baseline data for comparison (previous responses)
            snapshot_id: Optional snapshot ID
            
        Returns:
            Dict with detection results and overall status
        """
        signals = []
        
        configs = self._get_signal_configs(project_id)

        # Apply default zero-config when no configs exist
        if not configs:
            configs = self._get_default_configs()
        
        # Evaluate configured signals
        for config in configs:
            if not getattr(config, "enabled", True):
                continue
            stype = config.signal_type
            params = getattr(config, "params", None) or {}

            if stype == "length_change":
                baseline_text = baseline_data.get("baseline_response") if baseline_data else None
                if baseline_text:
                    result = self.detect_length_change(
                        response_text,
                        baseline_text,
                        params.get("threshold_ratio", self.DEFAULT_PARAMS["length_change"]["threshold_ratio"]),
                    )
                    if result["detected"]:
                        result["severity"] = params.get("severity") or config.severity or "medium"
                        signals.append(result)
                        self._save_detection(project_id, snapshot_id, result)

            elif stype == "latency_limit" and response_data:
                latency = response_data.get("latency_ms")
                if latency is not None:
                    result = self.detect_latency_limit(
                        latency,
                        params.get("limit_ms", self.DEFAULT_PARAMS["latency_limit"]["limit_ms"]),
                    )
                    if result["detected"]:
                        result["severity"] = params.get("severity") or config.severity or "medium"
                        signals.append(result)
                        self._save_detection(project_id, snapshot_id, result)

            elif stype == "token_limit" and response_data:
                tokens = response_data.get("tokens_used") or response_data.get("response_tokens")
                if tokens is not None:
                    result = self.detect_token_limit(
                        tokens,
                        params.get("limit_tokens", self.DEFAULT_PARAMS["token_limit"]["limit_tokens"]),
                    )
                    if result["detected"]:
                        result["severity"] = params.get("severity") or config.severity or "medium"
                        signals.append(result)
                        self._save_detection(project_id, snapshot_id, result)

            elif stype == "cost_limit" and response_data:
                cost = response_data.get("cost")
                if cost is not None:
                    result = self.detect_cost_limit(
                        cost,
                        params.get("limit_cost", self.DEFAULT_PARAMS["cost_limit"]["limit_cost"]),
                    )
                    if result["detected"]:
                        result["severity"] = params.get("severity") or config.severity or "medium"
                        signals.append(result)
                        self._save_detection(project_id, snapshot_id, result)

            elif stype == "json_schema":
                result = self.detect_json_schema(response_text, params)
                if result["detected"]:
                    result["severity"] = params.get("severity") or config.severity or "high"
                    signals.append(result)
                    self._save_detection(project_id, snapshot_id, result)

            elif stype == "custom":
                result = self.detect_custom_signal(response_text, config)
                if result["detected"]:
                    signals.append(result)
                    self._save_detection(project_id, snapshot_id, result)
        
        # Calculate overall status
        status = self._calculate_status(signals)
        
        return {
            "status": status,
            "signals": signals,
            "signal_count": len(signals),
            "critical_count": len([s for s in signals if s.get("severity") == "critical"]),
            "high_count": len([s for s in signals if s.get("severity") == "high"]),
            "is_worst": status == "critical",
            "worst_status": "unreviewed" if status == "critical" else None,
        }
    
    def detect_hallucination(
        self, 
        response_text: str, 
        request_data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Detect potential hallucination in response"""
        confidence = 0.0
        details = []
        
        overconfident_patterns = [
            r"definitely", r"absolutely", r"100%", r"certainly", r"without a doubt",
        ]
        
        uncertainty_patterns = [
            r"i think", r"i believe", r"probably", r"might be", r"could be",
            r"not sure", r"i'm not certain",
        ]
        
        text_lower = response_text.lower()
        
        overconfident_count = sum(1 for p in overconfident_patterns if re.search(p, text_lower))
        uncertainty_count = sum(1 for p in uncertainty_patterns if re.search(p, text_lower))
        
        if overconfident_count > 0 and uncertainty_count > 0:
            confidence += 0.3
            details.append("Mixed confidence signals detected")
        
        stat_pattern = r"\b\d{1,3}(?:\.\d+)?%\b"
        stats = re.findall(stat_pattern, response_text)
        if len(stats) > 2:
            confidence += 0.2
            details.append(f"Multiple statistics cited: {stats[:3]}")
        
        claim_patterns = [r"according to", r"studies show", r"research indicates", r"experts say"]
        for pattern in claim_patterns:
            if re.search(pattern, text_lower):
                confidence += 0.1
                details.append(f"Unverified claim pattern: {pattern}")
        
        detected = confidence >= self.DEFAULT_THRESHOLDS["hallucination"]
        
        return {
            "signal_type": "hallucination",
            "detected": detected,
            "confidence": min(confidence, 1.0),
            "severity": "high" if detected else "low",
            "details": {
                "indicators": details,
                "overconfident_phrases": overconfident_count,
                "uncertainty_phrases": uncertainty_count,
            }
        }
    
    def detect_length_change(
        self,
        response_text: str,
        baseline_text: str,
        threshold_ratio: float = 0.3,
    ) -> Dict[str, Any]:
        """Detect significant change in response length compared to baseline text."""
        current_length = len(response_text or "")
        baseline_length = len(baseline_text or "")

        if baseline_length == 0:
            return {
                "signal_type": "length_change",
                "detected": False,
                "severity": "low",
                "details": {
                    "current_length": current_length,
                    "baseline_length": baseline_length,
                    "change_ratio": None,
                    "note": "Baseline length is zero, cannot compute change ratio",
                },
            }

        change_ratio = abs(current_length - baseline_length) / baseline_length
        detected = change_ratio >= threshold_ratio

        severity = "medium" if change_ratio >= threshold_ratio else "low"
        if change_ratio >= threshold_ratio * 2:
            severity = "high"

        return {
            "signal_type": "length_change",
            "detected": detected,
            "severity": severity,
            "details": {
                "current_length": current_length,
                "baseline_length": baseline_length,
                "change_ratio": round(change_ratio, 3),
                "direction": "increased" if current_length > baseline_length else "decreased",
            },
        }
    
    def detect_refusal(self, response_text: str) -> Dict[str, Any]:
        """Detect refusal patterns in response"""
        text_lower = response_text.lower()
        
        matches = []
        for pattern in self.REFUSAL_PATTERNS:
            if re.search(pattern, text_lower):
                matches.append(pattern)
        
        detected = len(matches) > 0
        confidence = min(len(matches) * 0.3, 1.0)
        
        return {
            "signal_type": "refusal_increase",
            "detected": detected,
            "confidence": confidence,
            "severity": "high" if len(matches) >= 2 else "medium" if detected else "low",
            "details": {
                "matched_patterns": matches,
                "pattern_count": len(matches)
            }
        }
    
    def detect_json_schema(self, response_text: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Detect JSON validity and required fields."""
        detected = False
        details: Dict[str, Any] = {}
        required_fields = params.get("required") or []

        try:
            parsed = json.loads(response_text)
            missing = [field for field in required_fields if field not in parsed]
            if missing:
                detected = True
                details["missing_fields"] = missing
        except json.JSONDecodeError as e:
            detected = True
            details["error"] = str(e)
            details["response_preview"] = response_text[:200]

        return {
            "signal_type": "json_schema",
            "detected": detected,
            "severity": "high" if detected else "low",
            "details": details,
        }
    
    def detect_latency_limit(self, latency_ms: float, limit_ms: float) -> Dict[str, Any]:
        """Detect if latency exceeds configured limit."""
        detected = latency_ms >= limit_ms
        severity = "medium" if detected else "low"
        if latency_ms >= limit_ms * 1.5:
            severity = "high"

        return {
            "signal_type": "latency_limit",
            "detected": detected,
            "severity": severity,
            "details": {
                "latency_ms": latency_ms,
                "limit_ms": limit_ms,
            }
        }

    def detect_token_limit(self, tokens_used: float, limit_tokens: float) -> Dict[str, Any]:
        """Detect if token usage exceeds configured limit."""
        detected = tokens_used >= limit_tokens
        severity = "medium" if detected else "low"
        if tokens_used >= limit_tokens * 1.5:
            severity = "high"

        return {
            "signal_type": "token_limit",
            "detected": detected,
            "severity": severity,
            "details": {
                "tokens_used": tokens_used,
                "limit_tokens": limit_tokens,
            },
        }

    def detect_cost_limit(self, cost: float, limit_cost: float) -> Dict[str, Any]:
        """Detect if cost exceeds configured limit."""
        detected = cost >= limit_cost
        severity = "medium" if detected else "low"
        if cost >= limit_cost * 1.5:
            severity = "high"

        return {
            "signal_type": "cost_limit",
            "detected": detected,
            "severity": severity,
            "details": {
                "cost": cost,
                "limit_cost": limit_cost,
            },
        }
    
    def detect_tool_misuse(self, response_data: Dict) -> Dict[str, Any]:
        """Detect tool/function call misuse"""
        tool_calls = response_data.get("tool_calls", [])
        if not tool_calls:
            choices = response_data.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                tool_calls = message.get("tool_calls", [])
        
        if not tool_calls:
            return {
                "signal_type": "tool_misuse",
                "detected": False,
                "confidence": 0.0,
                "severity": "low",
                "details": {"message": "No tool calls"}
            }
        
        issues = []
        
        for tool_call in tool_calls:
            function = tool_call.get("function", {})
            name = function.get("name", "")
            arguments = function.get("arguments", "")
            
            if arguments:
                try:
                    json.loads(arguments)
                except json.JSONDecodeError:
                    issues.append(f"Invalid JSON in {name} arguments")
            
            if not name:
                issues.append("Empty function name")
        
        detected = len(issues) > 0
        
        return {
            "signal_type": "tool_misuse",
            "detected": detected,
            "confidence": min(len(issues) * 0.3, 1.0),
            "severity": "high" if detected else "low",
            "details": {
                "issues": issues,
                "tool_call_count": len(tool_calls)
            }
        }
    
    def detect_custom_signal(self, response_text: str, config) -> Dict[str, Any]:
        """Detect custom signal based on configuration"""
        custom_rule = (getattr(config, "params", None) or {})
        
        patterns = custom_rule.get("patterns", [])
        matches = []
        for pattern in patterns:
            if re.search(pattern, response_text, re.IGNORECASE):
                matches.append(pattern)
        
        keywords = custom_rule.get("keywords", [])
        keyword_matches = []
        text_lower = response_text.lower()
        for keyword in keywords:
            if keyword.lower() in text_lower:
                keyword_matches.append(keyword)
        
        min_length = custom_rule.get("min_length")
        max_length = custom_rule.get("max_length")
        length_issue = False
        if min_length and len(response_text) < min_length:
            length_issue = True
        if max_length and len(response_text) > max_length:
            length_issue = True
        
        detected = len(matches) > 0 or len(keyword_matches) > 0 or length_issue
        confidence = min((len(matches) + len(keyword_matches)) * 0.2 + (0.3 if length_issue else 0), 1.0)
        
        return {
            "signal_type": "custom",
            "custom_signal_name": config.name,
            "detected": detected,
            "confidence": confidence,
            "severity": "high" if detected and confidence > 0.7 else "medium" if detected else "low",
            "details": {
                "pattern_matches": matches,
                "keyword_matches": keyword_matches,
                "length_issue": length_issue,
                "rule_name": config.name
            }
        }
    
    def _get_signal_configs(self, project_id: int) -> List:
        """Get signal configurations for a project"""
        _, SignalConfig = self._get_models()
        return self.db.query(SignalConfig).filter(
            SignalConfig.project_id == project_id,
            SignalConfig.enabled == True
        ).all()

    def _get_default_configs(self) -> List:
        """Return zero-config defaults as SimpleNamespace objects (not persisted)."""
        return [
            SimpleNamespace(**cfg)
            for cfg in self.DEFAULT_SIGNAL_CONFIGS
        ]

    # ------------------------------------------------------------------
    # Config helpers for API layer
    # ------------------------------------------------------------------

    def get_project_default_configs(self, project_id: int) -> List[Dict[str, Any]]:
        """
        Return effective default configs for a project.
        Currently just DB configs for the project, or built-in defaults when empty.
        """
        configs = self.get_signal_configs_for_project(project_id)
        if not configs:
            # fall back to built-in defaults
            return self.DEFAULT_SIGNAL_CONFIGS
        # Normalize ORM objects to dicts
        out: List[Dict[str, Any]] = []
        for c in configs:
            out.append(
                {
                    "id": getattr(c, "id", None),
                    "project_id": c.project_id,
                    "signal_type": c.signal_type,
                    "name": c.name,
                    "params": c.params or {},
                    "severity": c.severity,
                    "enabled": c.enabled,
                    "created_at": getattr(c, "created_at", None),
                }
            )
        return out

    def get_agent_configs(self, project_id: int, agent_id: str) -> List[Dict[str, Any]]:
        """
        Return effective configs for a given agent:
        - Start from project defaults
        - Apply any configs whose params.agent_id == agent_id as overrides
        """
        _, SignalConfig = self._get_models()
        all_configs = (
            self.db.query(SignalConfig)
            .filter(SignalConfig.project_id == project_id)
            .all()
        )

        global_cfgs: Dict[str, Dict[str, Any]] = {}
        agent_overrides: Dict[str, Dict[str, Any]] = {}

        for c in all_configs:
            params = c.params or {}
            cfg = {
                "id": c.id,
                "project_id": c.project_id,
                "signal_type": c.signal_type,
                "name": c.name,
                "params": params,
                "severity": c.severity,
                "enabled": c.enabled,
                "created_at": getattr(c, "created_at", None),
            }
            aid = params.get("agent_id")
            if aid and str(aid) == str(agent_id):
                agent_overrides[c.signal_type] = cfg
            else:
                global_cfgs[c.signal_type] = cfg

        # Start from built-in defaults, apply global, then agent override
        effective: Dict[str, Dict[str, Any]] = {}
        for base in self.DEFAULT_SIGNAL_CONFIGS:
            stype = base["signal_type"]
            effective[stype] = {
                "id": None,
                "project_id": project_id,
                "signal_type": stype,
                "name": base["name"],
                "params": dict(base.get("params") or {}),
                "severity": base.get("severity"),
                "enabled": base.get("enabled", True),
                "created_at": None,
            }

        for stype, cfg in global_cfgs.items():
            effective[stype] = cfg

        for stype, cfg in agent_overrides.items():
            effective[stype] = cfg

        return list(effective.values())

    def upsert_agent_signal_config(
        self,
        project_id: int,
        agent_id: str,
        signal_type: str,
        name: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        severity: Optional[str] = None,
        enabled: Optional[bool] = None,
    ):
        """
        Create or update a SignalConfig row scoped to an agent.
        Agent scoping is stored inside params['agent_id'] to avoid schema changes.
        """
        _, SignalConfig = self._get_models()

        # Find existing config for this (project, agent, signal_type)
        existing = (
            self.db.query(SignalConfig)
            .filter(SignalConfig.project_id == project_id, SignalConfig.signal_type == signal_type)
            .all()
        )
        target = None
        for cfg in existing:
            aid = (cfg.params or {}).get("agent_id")
            if aid is not None and str(aid) == str(agent_id):
                target = cfg
                break

        if target is None:
            merged_params = dict(params or {})
            merged_params["agent_id"] = agent_id
            target = SignalConfig(
                project_id=project_id,
                signal_type=signal_type,
                name=name or signal_type,
                params=merged_params,
                severity=severity,
                enabled=True if enabled is None else enabled,
            )
            self.db.add(target)
        else:
            if params is not None:
                merged = dict(params)
                merged["agent_id"] = agent_id
                target.params = merged
            if name is not None:
                target.name = name
            if severity is not None:
                target.severity = severity
            if enabled is not None:
                target.enabled = enabled

        self.db.commit()
        self.db.refresh(target)
        return target
    
    def _is_signal_enabled(self, signal_type: str, configs: List) -> bool:
        """Check if a signal type is enabled (default True if no config)"""
        for config in configs:
            if config.signal_type == signal_type:
                return config.enabled
        return True
    
    def _get_threshold(self, signal_type: str, configs: List) -> float:
        """Get threshold for a signal type"""
        for config in configs:
            if config.signal_type != signal_type:
                continue
            params = getattr(config, "params", None) or {}
            if "threshold" in params and params["threshold"] is not None:
                return float(params["threshold"])
        # Fallback to default params if available
        if signal_type == "length_change":
            return self.DEFAULT_PARAMS["length_change"]["threshold_ratio"]
        return self.DEFAULT_THRESHOLDS.get(signal_type, 0.5)
    
    def _save_detection(self, project_id: int, snapshot_id: Optional[int], result: Dict):
        """Save a signal detection to database"""
        SignalDetection, _ = self._get_models()
        detection = SignalDetection(
            project_id=project_id,
            snapshot_id=snapshot_id,
            signal_type=result["signal_type"],
            severity=result.get("severity", "medium"),
            detected=result["detected"],
            confidence=result.get("confidence", 0.0),
            details=result.get("details"),
            custom_signal_name=result.get("custom_signal_name"),
        )
        self.db.add(detection)
        return detection
    
    def _calculate_status(self, signals: List[Dict]) -> str:
        """Calculate overall status based on detected signals"""
        if not signals:
            return "safe"
        
        critical_signals = [s for s in signals if s.get("severity") == "critical"]
        if critical_signals:
            return "critical"
        
        high_signals = [s for s in signals if s.get("severity") == "high"]
        if high_signals:
            return "needs_review"
        
        medium_signals = [s for s in signals if s.get("severity") == "medium"]
        if medium_signals:
            return "needs_review"
        
        return "safe"
    
    # Configuration management methods
    
    def create_signal_config(
        self,
        project_id: int,
        signal_type: str,
        name: str,
        params: Optional[Dict] = None,
        severity: Optional[str] = None,
        enabled: bool = True,
    ):
        """Create a signal configuration"""
        _, SignalConfig = self._get_models()
        signal_config = SignalConfig(
            project_id=project_id,
            signal_type=signal_type,
            name=name,
            params=params,
            severity=severity,
            enabled=enabled,
        )
        self.db.add(signal_config)
        self.db.commit()
        self.db.refresh(signal_config)
        return signal_config
    
    def get_signal_configs_for_project(self, project_id: int) -> List:
        """Get all signal configurations for a project"""
        _, SignalConfig = self._get_models()
        return self.db.query(SignalConfig).filter(
            SignalConfig.project_id == project_id
        ).all()

    def get_signal_config_by_id(self, config_id: str):
        """Get a signal configuration by ID"""
        _, SignalConfig = self._get_models()
        return self.db.query(SignalConfig).filter(
            SignalConfig.id == config_id
        ).first()
    
    def update_signal_config(self, config_id: str, project_id: Optional[int] = None, **kwargs):
        """Update a signal configuration"""
        _, SignalConfig = self._get_models()
        query = self.db.query(SignalConfig).filter(SignalConfig.id == config_id)
        if project_id is not None:
            query = query.filter(SignalConfig.project_id == project_id)
        config = query.first()
        
        if not config:
            return None
        
        for key, value in kwargs.items():
            if hasattr(config, key):
                setattr(config, key, value)
        
        self.db.commit()
        self.db.refresh(config)
        return config
    
    def delete_signal_config(self, config_id: str, project_id: Optional[int] = None) -> bool:
        """Delete a signal configuration"""
        _, SignalConfig = self._get_models()
        query = self.db.query(SignalConfig).filter(SignalConfig.id == config_id)
        if project_id is not None:
            query = query.filter(SignalConfig.project_id == project_id)
        config = query.first()
        
        if not config:
            return False
        
        self.db.delete(config)
        self.db.commit()
        return True
