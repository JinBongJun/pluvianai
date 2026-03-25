"""
Unit tests for DriftEngine - Enterprise-grade comprehensive testing
"""
import pytest
from datetime import datetime, timedelta
from app.services.drift_engine import DriftEngine
from app.models.api_call import APICall


@pytest.mark.unit
class TestDriftEngine:
    """Comprehensive tests for Drift Engine - all edge cases and error conditions"""
    
    # ========== Error Cases: Database Session ==========
    
    def test_detect_drift_no_db(self):
        """Test detect_drift raises ValueError when db is None"""
        engine = DriftEngine()
        
        with pytest.raises(ValueError, match="Database session required"):
            engine.detect_drift(project_id=1, db=None)
    
    # ========== Edge Cases: Empty Lists ==========
    
    def test_detect_length_drift_empty_baseline(self, db, test_project):
        """Test length drift detection with empty baseline"""
        engine = DriftEngine()
        
        baseline_calls = []
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="B" * 200,
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_length_drift(baseline_calls, current_calls)
        
        assert detection is None  # No baseline = no detection
    
    def test_detect_length_drift_empty_current(self, db, test_project):
        """Test length drift detection with empty current"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="A" * 100,
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = []
        
        detection = engine._detect_length_drift(baseline_calls, current_calls)
        
        assert detection is None  # No current = no detection
    
    def test_detect_length_drift_no_text(self, db, test_project):
        """Test length drift detection with no response_text"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text=None,  # No text
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="B" * 200,
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_length_drift(baseline_calls, current_calls)
        
        assert detection is None  # No baseline lengths
    
    # ========== Normal Cases: Length Drift ==========
    
    def test_detect_length_drift_significant_increase(self, db, test_project):
        """Test detecting significant length drift (100% increase)"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="A" * 100,
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="B" * 200,  # 100% increase
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_length_drift(baseline_calls, current_calls)
        
        assert detection is not None
        assert detection.detection_type == "length"
        assert detection.change_percentage >= 100  # 100% increase
        assert detection.severity in ["high", "critical"]
    
    def test_detect_length_drift_critical_threshold(self, db, test_project):
        """Test detecting critical length drift (30%+ change)"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="A" * 100,
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="B" * 130,  # 30% increase (critical threshold)
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_length_drift(baseline_calls, current_calls)
        
        assert detection is not None
        assert detection.severity == "critical"
    
    def test_no_drift_when_below_threshold(self, db, test_project):
        """Test no drift when change is below threshold (<15%)"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="A" * 100,
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_text="B" * 105,  # 5% 차이 (임계값 미만)
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_length_drift(baseline_calls, current_calls)
        
        assert detection is None
    
    def test_detect_length_drift_zero_baseline(self, db, test_project):
        """Test length drift with zero baseline (edge case)"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={},
                response_data={},
                response_text="",  # Empty string (length 0)
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={},
                response_data={},
                response_text="B" * 100,  # 100 characters
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_length_drift(baseline_calls, current_calls)
        
        # When baseline_avg = 0 and current_avg > 0, code sets change_pct = 1.0
        # change_pct (1.0) >= drift_threshold (0.15), so detection should be returned
        # However, empty strings might be filtered out by `if call.response_text`
        # Let's check: empty string "" is falsy, so `if call.response_text` is False
        # So baseline_lengths will be empty [], and function returns None
        # But wait, the code uses `call.response_text or ""` which means empty string becomes ""
        # And `if call.response_text` checks if it's truthy, so "" is falsy
        # So baseline_lengths = [] (empty), and function returns None
        assert detection is None  # Empty strings are filtered out, so no baseline lengths
    
    # ========== Normal Cases: Structure Drift ==========
    
    def test_detect_structure_drift(self, db, test_project):
        """Test detecting structure drift"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_data={"a": 1, "b": 2},
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_data={"a": 1, "c": 3},  # 필드 변경
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_structure_drift(baseline_calls, current_calls)
        
        assert detection is not None
        assert detection.detection_type == "structure"
        assert detection.change_percentage > 15
    
    # ========== Edge Cases: Structure Drift ==========
    
    def test_detect_structure_drift_empty_baseline(self, db, test_project):
        """Test structure drift with empty baseline"""
        engine = DriftEngine()
        
        baseline_calls = []
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_data={"a": 1},
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_structure_drift(baseline_calls, current_calls)
        
        assert detection is None
    
    def test_detect_structure_drift_no_response_data(self, db, test_project):
        """Test structure drift with no response_data"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_data=None,  # No data
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_data={"a": 1},
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_structure_drift(baseline_calls, current_calls)
        
        assert detection is None  # No baseline fields
    
    def test_detect_structure_drift_non_dict_data(self, db, test_project):
        """Test structure drift with non-dict response_data"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_data=[1, 2, 3],  # List, not dict
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                response_data={"a": 1},
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_structure_drift(baseline_calls, current_calls)
        
        assert detection is None  # No baseline fields (not dict)
    
    # ========== Normal Cases: Latency Drift ==========
    
    def test_detect_latency_drift_increase(self, db, test_project):
        """Test detecting latency drift (increase)"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=100.0,
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=200.0,  # 100% increase
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_latency_drift(baseline_calls, current_calls)
        
        assert detection is not None
        assert detection.detection_type == "latency"
        assert detection.severity in ["high", "critical"]  # Increase is bad
    
    def test_detect_latency_drift_decrease(self, db, test_project):
        """Test detecting latency drift (decrease - good)"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=200.0,
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=100.0,  # 50% decrease (good)
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_latency_drift(baseline_calls, current_calls)
        
        assert detection is not None
        assert detection.severity == "low"  # Decrease is good
    
    # ========== Edge Cases: Latency Drift ==========
    
    def test_detect_latency_drift_no_latency(self, db, test_project):
        """Test latency drift with no latency data"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=None,  # No latency
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=200.0,
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_latency_drift(baseline_calls, current_calls)
        
        assert detection is None  # No baseline latencies
    
    def test_detect_latency_drift_zero_baseline(self, db, test_project):
        """Test latency drift with zero baseline"""
        engine = DriftEngine()
        
        baseline_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=0.0,  # Zero
                created_at=datetime.utcnow() - timedelta(days=5)
            ) for _ in range(10)
        ]
        current_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                latency_ms=100.0,
                created_at=datetime.utcnow()
            ) for _ in range(10)
        ]
        
        detection = engine._detect_latency_drift(baseline_calls, current_calls)
        
        assert detection is None  # Zero baseline = cannot calculate percentage
    
    # ========== Integration: Full detect_drift ==========
    
    def test_detect_drift_no_data(self, db, test_project):
        """Test detect_drift with no data"""
        engine = DriftEngine()
        
        detections = engine.detect_drift(project_id=test_project.id, db=db)
        
        assert isinstance(detections, list)
        assert len(detections) == 0  # No data = no detections
