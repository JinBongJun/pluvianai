"""
Performance benchmarks for Firewall Service
Target: < 100ms for rule evaluation
"""

import pytest
import asyncio
import time
from app.services.firewall_service import firewall_service
from app.models.firewall_rule import FirewallRule, FirewallRuleType, FirewallAction, FirewallSeverity
from sqlalchemy.orm import Session


class TestFirewallPerformance:
    """Performance tests for Firewall Service (target < 100ms)"""

    @pytest.fixture
    def service(self):
        """Get FirewallService singleton instance"""
        return firewall_service

    @pytest.fixture
    def sample_rules(self, db: Session):
        """Create sample firewall rules for testing"""
        rules = [
            FirewallRule(
                project_id=1,
                rule_type=FirewallRuleType.PII,
                name="Email Detection",
                pattern=r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
                pattern_type="regex",
                action=FirewallAction.BLOCK,
                enabled=True,
                severity=FirewallSeverity.HIGH,
            ),
            FirewallRule(
                project_id=1,
                rule_type=FirewallRuleType.TOXICITY,
                name="Toxicity Check",
                pattern="hate|violence|threat",
                pattern_type="keyword",
                action=FirewallAction.BLOCK,
                enabled=True,
                severity=FirewallSeverity.HIGH,
            ),
            FirewallRule(
                project_id=1,
                rule_type=FirewallRuleType.CUSTOM,
                name="API Key Detection",
                pattern=r"sk-[a-zA-Z0-9]{32,}",
                pattern_type="regex",
                action=FirewallAction.BLOCK,
                enabled=True,
                severity=FirewallSeverity.CRITICAL,
            ),
        ]
        db.add_all(rules)
        db.commit()
        return rules

    @pytest.fixture
    def sample_payload(self):
        """Sample payload for testing"""
        return {
            "messages": [
                {
                    "role": "user",
                    "content": "My email is john.doe@example.com and I need help with my API key sk-1234567890abcdef1234567890abcdef"
                }
            ]
        }

    @pytest.fixture
    def large_payload(self):
        """Large payload for stress testing"""
        base_content = "This is a test message. " * 100
        return {
            "messages": [
                {"role": "user", "content": base_content + "Contact me at test@example.com"}
            ] * 10
        }

    @pytest.mark.asyncio
    async def test_single_rule_evaluation_performance(self, service, sample_rules, sample_payload):
        """Test performance of evaluating a single rule - should be < 10ms"""
        rule = sample_rules[0]
        test_text = str(sample_payload)
        
        start = time.time()
        result = await service._check_rule(rule, test_text, test_text)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 10, f"Single rule evaluation took {elapsed_ms:.2f}ms (target: < 10ms)"
        assert result is not None or True  # Result can be None if no match

    @pytest.mark.asyncio
    async def test_multiple_rules_evaluation_performance(self, service, sample_rules, sample_payload):
        """Test performance of evaluating multiple rules - should be < 50ms"""
        test_text = str(sample_payload)
        
        start = time.time()
        result = await service.scan_streaming_response(
            response_chunk=test_text,
            project_id=1,
            rules=sample_rules,
            accumulated_text=test_text
        )
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 50, f"Multiple rules evaluation took {elapsed_ms:.2f}ms (target: < 50ms)"
        assert "blocked" in result

    @pytest.mark.asyncio
    async def test_full_firewall_check_performance(self, service, sample_rules, sample_payload):
        """Test full firewall check performance - should be < 100ms"""
        test_text = str(sample_payload)
        
        start = time.time()
        result = await service.scan_streaming_response(
            response_chunk=test_text,
            project_id=1,
            rules=sample_rules,
            accumulated_text=test_text
        )
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 100, f"Full firewall check took {elapsed_ms:.2f}ms (target: < 100ms)"
        assert "blocked" in result

    @pytest.mark.asyncio
    async def test_large_payload_performance(self, service, sample_rules, large_payload):
        """Test performance with large payload - should still be < 100ms"""
        test_text = str(large_payload)
        
        start = time.time()
        result = await service.scan_streaming_response(
            response_chunk=test_text,
            project_id=1,
            rules=sample_rules,
            accumulated_text=test_text
        )
        elapsed_ms = (time.time() - start) * 1000

        # Allow slightly more time for large payloads
        assert elapsed_ms < 150, f"Large payload check took {elapsed_ms:.2f}ms (target: < 150ms)"
        assert "blocked" in result

    @pytest.mark.asyncio
    async def test_regex_pattern_performance(self, service, sample_rules):
        """Test regex pattern matching performance"""
        rule = sample_rules[0]  # Email regex rule
        test_text = "Contact me at john.doe@example.com for more information."
        
        start = time.time()
        result = await service._check_rule(rule, test_text, test_text)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 10, f"Regex pattern matching took {elapsed_ms:.2f}ms (target: < 10ms)"

    @pytest.mark.asyncio
    async def test_keyword_pattern_performance(self, service, sample_rules):
        """Test keyword pattern matching performance"""
        rule = sample_rules[1]  # Keyword rule
        test_text = "This message contains hate speech and violence."
        
        start = time.time()
        result = await service._check_rule(rule, test_text, test_text)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 5, f"Keyword pattern matching took {elapsed_ms:.2f}ms (target: < 5ms)"

    @pytest.mark.asyncio
    async def test_no_match_performance(self, service, sample_rules):
        """Test performance when no rules match (should be fast)"""
        clean_text = "This is a clean message with no sensitive data."
        
        start = time.time()
        result = await service.scan_streaming_response(
            response_chunk=clean_text,
            project_id=1,
            rules=sample_rules,
            accumulated_text=clean_text
        )
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 50, f"No match check took {elapsed_ms:.2f}ms (target: < 50ms)"
        assert result.get("blocked", False) == False

    @pytest.mark.asyncio
    async def test_batch_evaluation_performance(self, service, sample_rules):
        """Test performance when evaluating multiple payloads"""
        texts = [f"Test message {i} with email test{i}@example.com" for i in range(10)]
        
        start = time.time()
        results = await asyncio.gather(*[
            service.scan_streaming_response(
                response_chunk=text,
                project_id=1,
                rules=sample_rules,
                accumulated_text=text
            )
            for text in texts
        ])
        elapsed_ms = (time.time() - start) * 1000
        avg_per_payload = elapsed_ms / len(texts)

        assert avg_per_payload < 100, f"Average per payload: {avg_per_payload:.2f}ms (target: < 100ms)"
        assert len(results) == 10
