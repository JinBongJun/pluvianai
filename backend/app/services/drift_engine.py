"""
Drift detection engine for monitoring LLM output changes.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.models.drift_detection import DriftDetection


class DriftEngine:
    """Detect drift in LLM outputs"""
    
    def __init__(self):
        self.baseline_days = 7  # Baseline period in days
        self.drift_threshold = 0.15  # 15% change threshold for drift detection
        self.critical_threshold = 0.30  # 30% change threshold for critical drift
    
    def detect_drift(
        self,
        project_id: int,
        model: Optional[str] = None,
        agent_name: Optional[str] = None,
        db: Optional[Session] = None
    ) -> List[DriftDetection]:
        """
        Detect drift for a project
        
        Args:
            project_id: Project ID to analyze
            model: Optional model filter
            agent_name: Optional agent name filter
            db: Database session
        
        Returns:
            List of DriftDetection objects
        """
        if not db:
            raise ValueError("Database session required")
        
        # Calculate date ranges
        now = datetime.utcnow()
        baseline_end = now - timedelta(days=1)  # Exclude today from baseline
        baseline_start = baseline_end - timedelta(days=self.baseline_days)
        current_start = baseline_end
        
        # Build query for baseline
        baseline_query = db.query(APICall).filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= baseline_start,
                APICall.created_at < baseline_end
            )
        )
        
        # Build query for current period
        current_query = db.query(APICall).filter(
            and_(
                APICall.project_id == project_id,
                APICall.created_at >= current_start,
                APICall.created_at <= now
            )
        )
        
        # Apply filters
        if model:
            baseline_query = baseline_query.filter(APICall.model == model)
            current_query = current_query.filter(APICall.model == model)
        
        if agent_name:
            baseline_query = baseline_query.filter(APICall.agent_name == agent_name)
            current_query = current_query.filter(APICall.agent_name == agent_name)
        
        baseline_calls = baseline_query.all()
        current_calls = current_query.all()
        
        if not baseline_calls:
            # No baseline data, cannot detect drift
            return []
        
        detections = []
        
        # 1. Length drift detection
        length_drift = self._detect_length_drift(baseline_calls, current_calls)
        if length_drift:
            detections.append(length_drift)
        
        # 2. Structure drift detection
        structure_drift = self._detect_structure_drift(baseline_calls, current_calls)
        if structure_drift:
            detections.append(structure_drift)
        
        # 3. Latency drift detection
        latency_drift = self._detect_latency_drift(baseline_calls, current_calls)
        if latency_drift:
            detections.append(latency_drift)
        
        # 4. Quality score drift detection
        quality_drift = self._detect_quality_drift(
            project_id, baseline_start, baseline_end, current_start, now,
            model, agent_name, db
        )
        if quality_drift:
            detections.append(quality_drift)
        
        # Save detections to database and create alerts
        from app.models.alert import Alert
        
        alerts_created = []
        for detection in detections:
            detection.project_id = project_id
            detection.model = model
            detection.agent_name = agent_name
            detection.baseline_period_start = baseline_start
            detection.baseline_period_end = baseline_end
            db.add(detection)
            
            # Create alert for medium/high/critical severity detections
            if detection.severity in ["medium", "high", "critical"]:
                # Generate alert title and message
                model_str = f" ({detection.model})" if detection.model else ""
                agent_str = f" [{detection.agent_name}]" if detection.agent_name else ""
                
                title = f"Drift Detected: {detection.detection_type}{model_str}{agent_str}"
                
                # Build message from detection details
                message_parts = [
                    f"Detected {detection.detection_type} drift with {detection.change_percentage:.1f}% change.",
                ]
                
                if detection.detection_details and "evidence" in detection.detection_details:
                    message_parts.append(detection.detection_details["evidence"])
                
                message = " ".join(message_parts)
                
                # Determine notification channels based on severity
                if detection.severity == "critical":
                    channels = ["email", "slack"]
                elif detection.severity == "high":
                    channels = ["email"]
                else:
                    channels = ["email"]
                
                alert = Alert(
                    project_id=project_id,
                    alert_type="drift",
                    severity=detection.severity,
                    title=title,
                    message=message,
                    alert_data={
                        "detection_id": None,  # Will be set after detection is committed
                        "detection_type": detection.detection_type,
                        "model": detection.model,
                        "agent_name": detection.agent_name,
                        "change_percentage": detection.change_percentage,
                        "drift_score": detection.drift_score,
                        "current_value": detection.current_value,
                        "baseline_value": detection.baseline_value,
                    },
                    notification_channels=channels
                )
                db.add(alert)
                alerts_created.append(alert)
        
        db.commit()
        
        # Update alert_data with detection_id after commit
        for alert in alerts_created:
            # Find the corresponding detection
            for detection in detections:
                if (detection.detection_type == alert.alert_data.get("detection_type") and
                    detection.model == alert.alert_data.get("model") and
                    detection.agent_name == alert.alert_data.get("agent_name")):
                    alert.alert_data["detection_id"] = detection.id
                    break
        
        db.commit()
        
        return detections
    
    def _detect_length_drift(
        self,
        baseline_calls: List[APICall],
        current_calls: List[APICall]
    ) -> Optional[DriftDetection]:
        """Detect response length drift"""
        if not current_calls:
            return None
        
        # Calculate baseline average length
        baseline_lengths = [
            len(call.response_text or "") for call in baseline_calls if call.response_text
        ]
        if not baseline_lengths:
            return None
        
        baseline_avg = sum(baseline_lengths) / len(baseline_lengths)
        
        # Calculate current average length
        current_lengths = [
            len(call.response_text or "") for call in current_calls if call.response_text
        ]
        if not current_lengths:
            return None
        
        current_avg = sum(current_lengths) / len(current_lengths)
        
        # Calculate change percentage
        if baseline_avg == 0:
            change_pct = 1.0 if current_avg > 0 else 0.0
        else:
            change_pct = abs(current_avg - baseline_avg) / baseline_avg
        
        # Check if drift detected
        if change_pct < self.drift_threshold:
            return None
        
        # Calculate drift score (0-100)
        drift_score = min(change_pct * 100, 100.0)
        
        # Determine severity
        if change_pct >= self.critical_threshold:
            severity = "critical"
        elif change_pct >= self.drift_threshold * 1.5:
            severity = "high"
        else:
            severity = "medium"
        
        # Collect evidence: sample responses showing the change
        baseline_sample = None
        current_sample = None
        if baseline_calls:
            baseline_sample = (baseline_calls[0].response_text or "")[:200]  # First 200 chars
        if current_calls:
            current_sample = (current_calls[0].response_text or "")[:200]  # First 200 chars
        
        # Generate evidence message
        evidence = f"Average response length changed from {baseline_avg:.0f} to {current_avg:.0f} characters ({change_pct * 100:.1f}% change)."
        if baseline_sample and current_sample:
            evidence += f" Example baseline: '{baseline_sample[:50]}...' Example current: '{current_sample[:50]}...'"
        
        return DriftDetection(
            detection_type="length",
            current_value=current_avg,
            baseline_value=baseline_avg,
            change_percentage=change_pct * 100,
            drift_score=drift_score,
            severity=severity,
            detection_details={
                "baseline_count": len(baseline_lengths),
                "current_count": len(current_lengths),
                "baseline_avg": baseline_avg,
                "current_avg": current_avg,
                "evidence": evidence,
                "baseline_sample": baseline_sample,
                "current_sample": current_sample,
            }
        )
    
    def _detect_structure_drift(
        self,
        baseline_calls: List[APICall],
        current_calls: List[APICall]
    ) -> Optional[DriftDetection]:
        """Detect JSON structure drift"""
        if not current_calls:
            return None
        
        # Extract field sets from baseline
        baseline_fields = set()
        for call in baseline_calls:
            if call.response_data and isinstance(call.response_data, dict):
                baseline_fields.update(call.response_data.keys())
        
        if not baseline_fields:
            return None
        
        # Extract field sets from current
        current_fields = set()
        missing_fields = []
        for call in current_calls:
            if call.response_data and isinstance(call.response_data, dict):
                call_fields = set(call.response_data.keys())
                current_fields.update(call_fields)
                # Check for missing fields
                missing = baseline_fields - call_fields
                if missing:
                    missing_fields.extend(list(missing))
        
        if not current_fields:
            return None
        
        # Calculate field overlap
        common_fields = baseline_fields & current_fields
        total_fields = baseline_fields | current_fields
        
        if not total_fields:
            return None
        
        overlap_ratio = len(common_fields) / len(total_fields)
        change_pct = 1.0 - overlap_ratio
        
        # Check if drift detected
        if change_pct < self.drift_threshold:
            return None
        
        # Calculate drift score
        drift_score = change_pct * 100
        
        # Determine severity
        if change_pct >= self.critical_threshold:
            severity = "critical"
        elif change_pct >= self.drift_threshold * 1.5:
            severity = "high"
        else:
            severity = "medium"
        
        # Get most common missing fields
        from collections import Counter
        field_counter = Counter(missing_fields)
        most_missing = [field for field, count in field_counter.most_common(5)]
        
        # Collect evidence: sample responses showing structure changes
        baseline_sample = None
        current_sample = None
        if baseline_calls:
            baseline_data = baseline_calls[0].response_data
            if isinstance(baseline_data, dict):
                baseline_sample = list(baseline_data.keys())[:5]  # First 5 fields
        if current_calls:
            current_data = current_calls[0].response_data
            if isinstance(current_data, dict):
                current_sample = list(current_data.keys())[:5]  # First 5 fields
        
        # Generate evidence message
        evidence = f"JSON structure validity decreased from {len(baseline_fields)} to {len(current_fields)} fields ({change_pct * 100:.1f}% change)."
        if most_missing:
            evidence += f" Missing fields: {', '.join(most_missing[:3])}."
        if baseline_sample and current_sample:
            evidence += f" Baseline fields: {', '.join(baseline_sample)}. Current fields: {', '.join(current_sample)}."
        
        return DriftDetection(
            detection_type="structure",
            current_value=len(current_fields),
            baseline_value=len(baseline_fields),
            change_percentage=change_pct * 100,
            drift_score=drift_score,
            severity=severity,
            affected_fields=most_missing,
            detection_details={
                "baseline_fields": list(baseline_fields),
                "current_fields": list(current_fields),
                "missing_fields": most_missing,
                "overlap_ratio": overlap_ratio,
                "evidence": evidence,
                "baseline_sample": baseline_sample,
                "current_sample": current_sample,
            }
        )
    
    def _detect_latency_drift(
        self,
        baseline_calls: List[APICall],
        current_calls: List[APICall]
    ) -> Optional[DriftDetection]:
        """Detect latency drift"""
        if not current_calls:
            return None
        
        # Calculate baseline average latency
        baseline_latencies = [
            call.latency_ms for call in baseline_calls if call.latency_ms is not None
        ]
        if not baseline_latencies:
            return None
        
        baseline_avg = sum(baseline_latencies) / len(baseline_latencies)
        
        # Calculate current average latency
        current_latencies = [
            call.latency_ms for call in current_calls if call.latency_ms is not None
        ]
        if not current_latencies:
            return None
        
        current_avg = sum(current_latencies) / len(current_latencies)
        
        # Calculate change percentage
        if baseline_avg == 0:
            return None
        
        change_pct = abs(current_avg - baseline_avg) / baseline_avg
        
        # Check if drift detected (latency increase is more concerning)
        if change_pct < self.drift_threshold:
            return None
        
        # Calculate drift score
        drift_score = min(change_pct * 100, 100.0)
        
        # Determine severity (latency increase is worse)
        if current_avg > baseline_avg:
            if change_pct >= self.critical_threshold:
                severity = "critical"
            elif change_pct >= self.drift_threshold * 1.5:
                severity = "high"
            else:
                severity = "medium"
        else:
            severity = "low"  # Latency decrease is good
        
        return DriftDetection(
            detection_type="latency",
            current_value=current_avg,
            baseline_value=baseline_avg,
            change_percentage=change_pct * 100,
            drift_score=drift_score,
            severity=severity,
            detection_details={
                "baseline_avg_ms": baseline_avg,
                "current_avg_ms": current_avg,
                "is_increase": current_avg > baseline_avg,
            }
        )
    
    def _detect_quality_drift(
        self,
        project_id: int,
        baseline_start: datetime,
        baseline_end: datetime,
        current_start: datetime,
        current_end: datetime,
        model: Optional[str],
        agent_name: Optional[str],
        db: Session
    ) -> Optional[DriftDetection]:
        """Detect quality score drift"""
        # Get baseline quality scores
        baseline_query = db.query(QualityScore).join(APICall).filter(
            and_(
                QualityScore.project_id == project_id,
                QualityScore.created_at >= baseline_start,
                QualityScore.created_at < baseline_end
            )
        )
        
        # Get current quality scores
        current_query = db.query(QualityScore).join(APICall).filter(
            and_(
                QualityScore.project_id == project_id,
                QualityScore.created_at >= current_start,
                QualityScore.created_at <= current_end
            )
        )
        
        # Apply filters
        if model:
            baseline_query = baseline_query.filter(APICall.model == model)
            current_query = current_query.filter(APICall.model == model)
        
        if agent_name:
            baseline_query = baseline_query.filter(APICall.agent_name == agent_name)
            current_query = current_query.filter(APICall.agent_name == agent_name)
        
        baseline_scores = [s.overall_score for s in baseline_query.all()]
        current_scores = [s.overall_score for s in current_query.all()]
        
        if not baseline_scores or not current_scores:
            return None
        
        baseline_avg = sum(baseline_scores) / len(baseline_scores)
        current_avg = sum(current_scores) / len(current_scores)
        
        # Calculate change percentage
        if baseline_avg == 0:
            return None
        
        change_pct = abs(current_avg - baseline_avg) / baseline_avg
        
        # Check if drift detected (quality decrease is concerning)
        if change_pct < self.drift_threshold:
            return None
        
        # Calculate drift score
        drift_score = min(change_pct * 100, 100.0)
        
        # Determine severity (quality decrease is worse)
        if current_avg < baseline_avg:
            if change_pct >= self.critical_threshold:
                severity = "critical"
            elif change_pct >= self.drift_threshold * 1.5:
                severity = "high"
            else:
                severity = "medium"
        else:
            severity = "low"  # Quality increase is good
        
        return DriftDetection(
            detection_type="quality",
            current_value=current_avg,
            baseline_value=baseline_avg,
            change_percentage=change_pct * 100,
            drift_score=drift_score,
            severity=severity,
            detection_details={
                "baseline_avg_score": baseline_avg,
                "current_avg_score": current_avg,
                "is_decrease": current_avg < baseline_avg,
            }
        )
