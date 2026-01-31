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
from sqlalchemy.orm import Session
from app.core.logging_config import logger


class SignalDetectionService:
    """Service for detecting signals in LLM responses"""
    
    # Default thresholds
    DEFAULT_THRESHOLDS = {
        "hallucination": 0.7,
        "length_change": 0.3,  # 30% change
        "refusal_increase": 0.2,  # 20% increase
        "json_schema_break": 1.0,  # Any break
        "latency_spike": 2.0,  # 2x baseline
        "tool_misuse": 0.5,
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
        
        # Get project-specific configs
        configs = self._get_signal_configs(project_id)
        
        # 1. Hallucination detection
        if self._is_signal_enabled("hallucination", configs):
            result = self.detect_hallucination(response_text, request_data)
            if result["detected"]:
                signals.append(result)
                self._save_detection(project_id, snapshot_id, result)
        
        # 2. Length change detection
        if self._is_signal_enabled("length_change", configs) and baseline_data:
            result = self.detect_length_change(
                response_text, 
                baseline_data.get("avg_length", 0),
                self._get_threshold("length_change", configs)
            )
            if result["detected"]:
                signals.append(result)
                self._save_detection(project_id, snapshot_id, result)
        
        # 3. Refusal detection
        if self._is_signal_enabled("refusal_increase", configs):
            result = self.detect_refusal(response_text)
            if result["detected"]:
                signals.append(result)
                self._save_detection(project_id, snapshot_id, result)
        
        # 4. JSON schema break detection
        if self._is_signal_enabled("json_schema_break", configs):
            result = self.detect_json_schema_break(response_text, request_data)
            if result["detected"]:
                signals.append(result)
                self._save_detection(project_id, snapshot_id, result)
        
        # 5. Latency spike detection
        if self._is_signal_enabled("latency_spike", configs) and response_data:
            latency = response_data.get("latency_ms", 0)
            baseline_latency = baseline_data.get("avg_latency", 0) if baseline_data else 0
            if latency and baseline_latency:
                result = self.detect_latency_spike(
                    latency,
                    baseline_latency,
                    self._get_threshold("latency_spike", configs)
                )
                if result["detected"]:
                    signals.append(result)
                    self._save_detection(project_id, snapshot_id, result)
        
        # 6. Tool misuse detection
        if self._is_signal_enabled("tool_misuse", configs) and response_data:
            result = self.detect_tool_misuse(response_data)
            if result["detected"]:
                signals.append(result)
                self._save_detection(project_id, snapshot_id, result)
        
        # 7. Custom signals
        _, SignalConfig = self._get_models()
        custom_configs = [c for c in configs if c.signal_type == "custom"]
        for config in custom_configs:
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
        baseline_length: float,
        threshold: float = 0.3
    ) -> Dict[str, Any]:
        """Detect significant change in response length"""
        current_length = len(response_text)
        
        if baseline_length == 0:
            return {
                "signal_type": "length_change",
                "detected": False,
                "confidence": 0.0,
                "severity": "low",
                "details": {"message": "No baseline data"}
            }
        
        change_ratio = abs(current_length - baseline_length) / baseline_length
        detected = change_ratio >= threshold
        
        if change_ratio >= 0.7:
            severity = "critical"
        elif change_ratio >= 0.5:
            severity = "high"
        elif change_ratio >= 0.3:
            severity = "medium"
        else:
            severity = "low"
        
        return {
            "signal_type": "length_change",
            "detected": detected,
            "confidence": min(change_ratio, 1.0),
            "severity": severity if detected else "low",
            "details": {
                "current_length": current_length,
                "baseline_length": baseline_length,
                "change_ratio": round(change_ratio, 3),
                "direction": "increased" if current_length > baseline_length else "decreased"
            }
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
    
    def detect_json_schema_break(
        self, 
        response_text: str, 
        request_data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Detect if response should be JSON but isn't valid"""
        expects_json = False
        if request_data:
            if request_data.get("response_format", {}).get("type") == "json_object":
                expects_json = True
            messages = request_data.get("messages", [])
            for msg in messages:
                content = msg.get("content", "").lower()
                if "json" in content and ("format" in content or "return" in content):
                    expects_json = True
                    break
        
        if not expects_json:
            return {
                "signal_type": "json_schema_break",
                "detected": False,
                "confidence": 0.0,
                "severity": "low",
                "details": {"message": "JSON not expected"}
            }
        
        try:
            json.loads(response_text)
            return {
                "signal_type": "json_schema_break",
                "detected": False,
                "confidence": 0.0,
                "severity": "low",
                "details": {"message": "Valid JSON"}
            }
        except json.JSONDecodeError as e:
            return {
                "signal_type": "json_schema_break",
                "detected": True,
                "confidence": 1.0,
                "severity": "critical",
                "details": {
                    "error": str(e),
                    "expected_json": True,
                    "response_preview": response_text[:200]
                }
            }
    
    def detect_latency_spike(
        self, 
        current_latency: float, 
        baseline_latency: float,
        threshold: float = 2.0
    ) -> Dict[str, Any]:
        """Detect latency spike compared to baseline"""
        if baseline_latency == 0:
            return {
                "signal_type": "latency_spike",
                "detected": False,
                "confidence": 0.0,
                "severity": "low",
                "details": {"message": "No baseline data"}
            }
        
        ratio = current_latency / baseline_latency
        detected = ratio >= threshold
        
        if ratio >= 5.0:
            severity = "critical"
        elif ratio >= 3.0:
            severity = "high"
        elif ratio >= 2.0:
            severity = "medium"
        else:
            severity = "low"
        
        return {
            "signal_type": "latency_spike",
            "detected": detected,
            "confidence": min(ratio / 5.0, 1.0),
            "severity": severity if detected else "low",
            "details": {
                "current_latency_ms": current_latency,
                "baseline_latency_ms": baseline_latency,
                "ratio": round(ratio, 2)
            }
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
        custom_rule = config.custom_rule or {}
        
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
    
    def _is_signal_enabled(self, signal_type: str, configs: List) -> bool:
        """Check if a signal type is enabled (default True if no config)"""
        for config in configs:
            if config.signal_type == signal_type:
                return config.enabled
        return True
    
    def _get_threshold(self, signal_type: str, configs: List) -> float:
        """Get threshold for a signal type"""
        for config in configs:
            if config.signal_type == signal_type and config.threshold:
                return config.threshold
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
        if len(high_signals) >= 2:
            return "critical"
        if high_signals:
            return "regressed"
        
        medium_signals = [s for s in signals if s.get("severity") == "medium"]
        if len(medium_signals) >= 3:
            return "regressed"
        
        return "safe"
    
    # Configuration management methods
    
    def create_signal_config(
        self,
        project_id: int,
        signal_type: str,
        name: str,
        description: Optional[str] = None,
        threshold: float = 0.5,
        config: Optional[Dict] = None,
        custom_rule: Optional[Dict] = None,
    ):
        """Create a signal configuration"""
        _, SignalConfig = self._get_models()
        signal_config = SignalConfig(
            project_id=project_id,
            signal_type=signal_type,
            name=name,
            description=description,
            threshold=threshold,
            config=config,
            custom_rule=custom_rule,
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
    
    def update_signal_config(self, config_id: int, **kwargs):
        """Update a signal configuration"""
        _, SignalConfig = self._get_models()
        config = self.db.query(SignalConfig).filter(
            SignalConfig.id == config_id
        ).first()
        
        if not config:
            return None
        
        for key, value in kwargs.items():
            if hasattr(config, key):
                setattr(config, key, value)
        
        self.db.commit()
        self.db.refresh(config)
        return config
    
    def delete_signal_config(self, config_id: int) -> bool:
        """Delete a signal configuration"""
        _, SignalConfig = self._get_models()
        config = self.db.query(SignalConfig).filter(
            SignalConfig.id == config_id
        ).first()
        
        if not config:
            return False
        
        self.db.delete(config)
        self.db.commit()
        return True
