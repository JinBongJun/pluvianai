"""
Unit tests for QualityEvaluator - Enterprise-grade comprehensive testing
"""
import pytest
import json
from app.services.quality_evaluator import QualityEvaluator
from app.models.api_call import APICall
from app.models.quality_score import QualityScore


@pytest.mark.unit
class TestQualityEvaluator:
    """Comprehensive tests for Quality Evaluator - all edge cases and error conditions"""
    
    # ========== Normal Cases ==========
    
    def test_evaluate_valid_json_response(self, db, test_project):
        """Test evaluating valid JSON response"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={"messages": [{"role": "user", "content": "Hello"}]},
            response_data={
                "choices": [{
                    "message": {"content": "Hello! How can I help you?"}
                }]
            },
            response_text="Hello! How can I help you?",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert isinstance(score, QualityScore)
        assert 0 <= score.overall_score <= 100
        assert score.json_valid is True
        assert score.length_acceptable is True
        assert score.format_valid is True
    
    def test_evaluate_with_advanced_features(self, db, test_project):
        """Test evaluating with advanced features enabled"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={"choices": [{"message": {"content": "Test response"}}]},
            response_text="Test response with sufficient length",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call, use_advanced=True)
        
        assert isinstance(score, QualityScore)
        assert 0 <= score.overall_score <= 100
        assert score.semantic_consistency_score is not None
        assert score.tone_score is not None
        assert score.coherence_score is not None
    
    # ========== Edge Cases: Empty/None Values ==========
    
    def test_evaluate_empty_response_text(self, db, test_project):
        """Test evaluating empty response text"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="",  # Empty
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert isinstance(score, QualityScore)
        assert score.length_acceptable is False
        assert score.format_valid is False
    
    def test_evaluate_none_response_text(self, db, test_project):
        """Test evaluating None response text"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text=None,
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert isinstance(score, QualityScore)
        assert 0 <= score.overall_score <= 100
    
    def test_evaluate_empty_response_data(self, db, test_project):
        """Test evaluating empty response data"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},  # Empty dict
            response_text="Valid text response",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert isinstance(score, QualityScore)
        assert 0 <= score.overall_score <= 100
    
    # ========== Edge Cases: Length Boundaries ==========
    
    def test_evaluate_min_length_boundary(self, db, test_project):
        """Test evaluating response at minimum length threshold (10 chars)"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="A" * 10,  # Exactly 10 chars (minimum)
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.length_acceptable is True
    
    def test_evaluate_below_min_length(self, db, test_project):
        """Test evaluating response below minimum length (9 chars)"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="A" * 9,  # 9 chars (below minimum)
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.length_acceptable is False
    
    def test_evaluate_max_length_boundary(self, db, test_project):
        """Test evaluating response at maximum length threshold"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="A" * 100000,  # Exactly max length
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.length_acceptable is True
    
    def test_evaluate_above_max_length(self, db, test_project):
        """Test evaluating response above maximum length"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="A" * 100001,  # Above max length
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.length_acceptable is False
    
    # ========== Edge Cases: JSON Validation ==========
    
    def test_evaluate_invalid_json_in_text(self, db, test_project):
        """Test evaluating invalid JSON in response_text"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},  # Empty, so will try to parse text
            response_text="{ invalid json }",  # Invalid JSON
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.json_valid is False
    
    def test_evaluate_valid_json_in_text(self, db, test_project):
        """Test evaluating valid JSON in response_text"""
        evaluator = QualityEvaluator()
        
        valid_json = json.dumps({"key": "value"})
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},  # Empty
            response_text=valid_json,  # Valid JSON string
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.json_valid is True
    
    # ========== Edge Cases: Required Fields ==========
    
    def test_evaluate_with_all_required_fields(self, db, test_project):
        """Test evaluating with all required fields present"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={"message": "Hello", "content": "World"},  # Both fields present
            response_text="Hello World",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call, required_fields=["message", "content"])
        
        assert score.required_fields_present is True
    
    def test_evaluate_with_missing_required_fields(self, db, test_project):
        """Test evaluating with missing required fields"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={"content": "World"},  # Missing "message"
            response_text="World",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call, required_fields=["message", "content"])
        
        assert score.required_fields_present is False
    
    def test_evaluate_with_no_required_fields_specified(self, db, test_project):
        """Test evaluating when no required fields specified"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={"key": "value"},
            response_text="Test",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call, required_fields=None)
        
        assert score.required_fields_present is None  # Not checked when None
    
    def test_evaluate_with_empty_required_fields_list(self, db, test_project):
        """Test evaluating with empty required fields list"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={"key": "value"},
            response_text="Test",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call, required_fields=[])
        
        # Empty list means no fields to check, so should be None or True
        assert score.required_fields_present is None or score.required_fields_present is True
    
    # ========== Edge Cases: Format Validation ==========
    
    def test_evaluate_markdown_with_unclosed_code_block(self, db, test_project):
        """Test evaluating markdown with unclosed code block"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="```python\ncode here",  # Unclosed code block (odd number)
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.format_valid is False
    
    def test_evaluate_markdown_with_closed_code_block(self, db, test_project):
        """Test evaluating markdown with closed code block"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="```python\ncode here\n```",  # Closed code block (even number)
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call)
        
        assert score.format_valid is True
    
    # ========== Edge Cases: Non-dict response_data ==========
    
    def test_evaluate_with_list_response_data(self, db, test_project):
        """Test evaluating with list response_data (not dict)"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data=[1, 2, 3],  # List, not dict
            response_text="Test",
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call, required_fields=["key"])
        
        assert isinstance(score, QualityScore)
        assert score.required_fields_present is False  # Not a dict
    
    # ========== Advanced Features Edge Cases ==========
    
    def test_evaluate_advanced_features_with_empty_text(self, db, test_project):
        """Test advanced features with empty text"""
        evaluator = QualityEvaluator()
        
        api_call = APICall(
            project_id=test_project.id,
            provider="openai",
            model="gpt-4",
            request_data={},
            response_data={},
            response_text="",  # Empty
            status_code=200
        )
        db.add(api_call)
        db.commit()
        
        score = evaluator.evaluate(api_call, use_advanced=True)
        
        assert score.semantic_consistency_score == 0.0  # Empty text = 0.0
        assert score.tone_score == 0.0
        assert score.coherence_score == 0.0
    
    # ========== Batch Evaluation ==========
    
    def test_evaluate_batch_empty_list(self, db):
        """Test batch evaluation with empty list"""
        evaluator = QualityEvaluator()
        
        scores = evaluator.evaluate_batch([], db=db)
        
        assert isinstance(scores, list)
        assert len(scores) == 0
    
    def test_evaluate_batch_multiple_calls(self, db, test_project):
        """Test batch evaluation with multiple calls"""
        evaluator = QualityEvaluator()
        
        api_calls = [
            APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={},
                response_data={"choices": [{"message": {"content": f"Response {i}"}}]},
                response_text=f"Response {i} with sufficient length",
                status_code=200
            ) for i in range(5)
        ]
        
        for call in api_calls:
            db.add(call)
        db.commit()
        
        scores = evaluator.evaluate_batch(api_calls, db=db)
        
        assert isinstance(scores, list)
        assert len(scores) == 5
        assert all(isinstance(s, QualityScore) for s in scores)
        assert all(0 <= s.overall_score <= 100 for s in scores)
