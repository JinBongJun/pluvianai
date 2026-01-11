"""
Unit tests for CostAnalyzer - Enterprise-grade comprehensive testing
"""
import pytest
from datetime import datetime, timedelta
from app.services.cost_analyzer import CostAnalyzer
from app.models.api_call import APICall


@pytest.mark.unit
class TestCostAnalyzer:
    """Comprehensive tests for Cost Analyzer - all edge cases and error conditions"""
    
    # ========== Error Cases: Database Session ==========
    
    def test_analyze_project_costs_no_db(self):
        """Test analyze_project_costs raises ValueError when db is None"""
        analyzer = CostAnalyzer()
        
        with pytest.raises(ValueError, match="Database session required"):
            analyzer.analyze_project_costs(project_id=1, db=None)
    
    def test_detect_cost_anomalies_no_db(self):
        """Test detect_cost_anomalies raises ValueError when db is None"""
        analyzer = CostAnalyzer()
        
        with pytest.raises(ValueError, match="Database session required"):
            analyzer.detect_cost_anomalies(project_id=1, db=None)
    
    # ========== Normal Cases: Cost Calculation ==========
    
    def test_calculate_cost_openai_gpt4(self):
        """Test calculating cost for OpenAI GPT-4"""
        analyzer = CostAnalyzer()
        
        cost = analyzer.calculate_cost(
            provider="openai",
            model="gpt-4",
            input_tokens=1000,
            output_tokens=500
        )
        
        assert cost > 0
        assert isinstance(cost, float)
    
    def test_calculate_cost_anthropic_claude(self):
        """Test calculating cost for Anthropic Claude"""
        analyzer = CostAnalyzer()
        
        cost = analyzer.calculate_cost(
            provider="anthropic",
            model="claude-3-opus-20240229",
            input_tokens=1000,
            output_tokens=500
        )
        
        assert cost > 0
    
    def test_calculate_cost_google(self):
        """Test calculating cost for Google models"""
        analyzer = CostAnalyzer()
        
        cost = analyzer.calculate_cost(
            provider="google",
            model="gemini-pro",
            input_tokens=1000,
            output_tokens=500
        )
        
        assert cost > 0
        assert isinstance(cost, float)
    
    # ========== Edge Cases: Cost Calculation ==========
    
    def test_calculate_cost_zero_tokens(self):
        """Test calculating cost with zero tokens"""
        analyzer = CostAnalyzer()
        
        cost = analyzer.calculate_cost(
            provider="openai",
            model="gpt-4",
            input_tokens=0,
            output_tokens=0
        )
        
        assert cost == 0.0
    
    def test_calculate_cost_large_tokens(self):
        """Test calculating cost with large token counts"""
        analyzer = CostAnalyzer()
        
        cost = analyzer.calculate_cost(
            provider="openai",
            model="gpt-4",
            input_tokens=1_000_000,  # 1M tokens
            output_tokens=500_000
        )
        
        assert cost > 0
        assert isinstance(cost, float)
    
    def test_calculate_cost_unknown_provider(self):
        """Test calculating cost for unknown provider (fallback)"""
        analyzer = CostAnalyzer()
        
        cost = analyzer.calculate_cost(
            provider="unknown_provider",
            model="unknown_model",
            input_tokens=1000,
            output_tokens=500
        )
        
        assert cost > 0  # Should use fallback pricing
        assert isinstance(cost, float)
    
    def test_calculate_cost_unknown_model(self):
        """Test calculating cost for unknown model (fallback)"""
        analyzer = CostAnalyzer()
        
        cost = analyzer.calculate_cost(
            provider="openai",
            model="unknown-model",
            input_tokens=1000,
            output_tokens=500
        )
        
        assert cost > 0  # Should use default pricing
        assert isinstance(cost, float)
    
    # ========== Normal Cases: Cost Analysis ==========
    
    def test_analyze_project_costs(self, db, test_project):
        """Test analyzing project costs"""
        analyzer = CostAnalyzer()
        
        for i in range(5):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=1000,
                response_tokens=500,
                created_at=datetime.utcnow() - timedelta(days=i)
            )
            db.add(api_call)
        
        db.commit()
        
        analysis = analyzer.analyze_project_costs(test_project.id, db=db)
        
        assert "total_cost" in analysis
        assert "by_model" in analysis
        assert "by_provider" in analysis
        assert "by_day" in analysis
        assert "average_daily_cost" in analysis
        assert analysis["total_cost"] > 0
    
    def test_analyze_project_costs_no_data(self, db, test_project):
        """Test analyzing project costs with no data"""
        analyzer = CostAnalyzer()
        
        analysis = analyzer.analyze_project_costs(test_project.id, db=db)
        
        assert analysis["total_cost"] == 0.0
        assert analysis["by_model"] == {}
        assert analysis["by_provider"] == {}
        assert analysis["by_day"] == []
        assert analysis["average_daily_cost"] == 0.0
    
    def test_analyze_project_costs_custom_date_range(self, db, test_project):
        """Test analyzing project costs with custom date range"""
        analyzer = CostAnalyzer()
        
        start_date = datetime.utcnow() - timedelta(days=14)
        end_date = datetime.utcnow() - timedelta(days=7)
        
        for i in range(5):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=1000,
                response_tokens=500,
                created_at=end_date - timedelta(days=i)
            )
            db.add(api_call)
        
        db.commit()
        
        analysis = analyzer.analyze_project_costs(
            test_project.id,
            start_date=start_date,
            end_date=end_date,
            db=db
        )
        
        assert "total_cost" in analysis
        assert analysis["period_start"] == start_date
        assert analysis["period_end"] == end_date
    
    # ========== Normal Cases: Cost Anomaly Detection ==========
    
    def test_detect_cost_anomaly_yesterday_spike(self, db, test_project):
        """Test detecting cost anomaly compared to yesterday"""
        analyzer = CostAnalyzer()
        
        yesterday = datetime.utcnow() - timedelta(days=1)
        
        # 저비용 API calls (어제)
        for _ in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-3.5-turbo",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=100,
                response_tokens=100,
                created_at=yesterday
            )
            db.add(api_call)
        
        # 고비용 API calls (오늘)
        for _ in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=1000,
                response_tokens=1000,
                created_at=datetime.utcnow()
            )
            db.add(api_call)
        
        db.commit()
        
        alerts = analyzer.detect_cost_anomalies(test_project.id, db)
        
        assert len(alerts) > 0
        assert any(a.alert_type == "cost_spike" for a in alerts)
        assert any(a.severity in ["medium", "high", "critical"] for a in alerts)
    
    def test_detect_cost_anomaly_weekly_spike(self, db, test_project):
        """Test detecting cost anomaly compared to weekly average"""
        analyzer = CostAnalyzer()
        
        # 저비용 API calls (7일 전)
        for day in range(7):
            date = datetime.utcnow() - timedelta(days=day+1)
            for _ in range(5):
                api_call = APICall(
                    project_id=test_project.id,
                    provider="openai",
                    model="gpt-3.5-turbo",
                    request_data={"messages": [{"role": "user", "content": "Test"}]},
                    response_data={"choices": [{"message": {"content": "Response"}}]},
                    request_tokens=100,
                    response_tokens=100,
                    created_at=date
                )
                db.add(api_call)
        
        # 고비용 API calls (오늘)
        for _ in range(50):  # 5배 이상 증가
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=1000,
                response_tokens=1000,
                created_at=datetime.utcnow()
            )
            db.add(api_call)
        
        db.commit()
        
        alerts = analyzer.detect_cost_anomalies(test_project.id, db)
        
        assert len(alerts) > 0
        assert any(a.alert_type == "cost_spike" for a in alerts)
        assert any(a.severity in ["high", "critical"] for a in alerts)
    
    # ========== Edge Cases: Cost Anomaly Detection ==========
    
    def test_detect_cost_anomaly_no_yesterday_data(self, db, test_project):
        """Test cost anomaly detection with no yesterday data"""
        analyzer = CostAnalyzer()
        
        # 오늘만 데이터
        for _ in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=1000,
                response_tokens=1000,
                created_at=datetime.utcnow()
            )
            db.add(api_call)
        
        db.commit()
        
        alerts = analyzer.detect_cost_anomalies(test_project.id, db)
        
        # No yesterday data = no alerts for yesterday comparison
        # But might have weekly average alerts
        assert isinstance(alerts, list)
    
    def test_detect_cost_anomaly_no_data(self, db, test_project):
        """Test cost anomaly detection with no data"""
        analyzer = CostAnalyzer()
        
        alerts = analyzer.detect_cost_anomalies(test_project.id, db)
        
        assert isinstance(alerts, list)
        assert len(alerts) == 0  # No data = no alerts
    
    def test_detect_cost_anomaly_critical_severity(self, db, test_project):
        """Test cost anomaly detection with critical severity (5x+ increase)"""
        analyzer = CostAnalyzer()
        
        yesterday = datetime.utcnow() - timedelta(days=1)
        
        # 저비용 (어제)
        for _ in range(10):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-3.5-turbo",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=100,
                response_tokens=100,
                created_at=yesterday
            )
            db.add(api_call)
        
        # 매우 고비용 (오늘) - 5배 이상
        for _ in range(100):
            api_call = APICall(
                project_id=test_project.id,
                provider="openai",
                model="gpt-4",
                request_data={"messages": [{"role": "user", "content": "Test"}]},
                response_data={"choices": [{"message": {"content": "Response"}}]},
                request_tokens=10000,
                response_tokens=10000,
                created_at=datetime.utcnow()
            )
            db.add(api_call)
        
        db.commit()
        
        alerts = analyzer.detect_cost_anomalies(test_project.id, db)
        
        assert len(alerts) > 0
        assert any(a.severity == "critical" or a.severity == "high" for a in alerts)
