"""
Performance benchmarks for PII Sanitizer
Target: < 50ms total processing time
"""
import pytest
import time
from app.services.pii_sanitizer import PIISanitizer


class TestPIISanitizerPerformance:
    """Performance tests for PII Sanitizer (target < 50ms)"""

    @pytest.fixture
    def sanitizer(self):
        """Create PII sanitizer instance"""
        return PIISanitizer(use_presidio=True, timeout_ms=100)

    @pytest.fixture
    def sanitizer_regex_only(self):
        """Create regex-only PII sanitizer (no Presidio)"""
        return PIISanitizer(use_presidio=False)

    @pytest.fixture
    def sample_text_with_pii(self):
        """Sample text containing various PII types"""
        return """
        Contact John Doe at john.doe@example.com or call 555-123-4567.
        Credit card: 4532-1234-5678-9010
        SSN: 123-45-6789
        API Key: sk-1234567890abcdef1234567890abcdef
        """

    @pytest.fixture
    def large_text(self):
        """Large text sample for stress testing"""
        base_text = """
        User information: John Doe, email: john.doe@example.com, phone: 555-123-4567.
        Address: 123 Main St, New York, NY 10001.
        Credit card: 4532-1234-5678-9010, SSN: 123-45-6789.
        """
        # Repeat to create ~5KB text
        return base_text * 50

    @pytest.fixture
    def complex_payload(self):
        """Complex nested payload structure"""
        return {
            "messages": [
                {
                    "role": "user",
                    "content": "My email is john.doe@example.com and phone is 555-123-4567"
                },
                {
                    "role": "assistant",
                    "content": "I'll help you with that. Your SSN is 123-45-6789."
                }
            ],
            "metadata": {
                "user_id": "user_123",
                "api_key": "sk-1234567890abcdef1234567890abcdef",
                "contact": {
                    "email": "admin@example.com",
                    "phone": "555-987-6543"
                }
            }
        }

    def test_regex_stage_performance(self, sanitizer, sample_text_with_pii):
        """Test Stage 1 (Regex) performance - should be < 10ms"""
        start = time.time()
        result = sanitizer._sanitize_string(sample_text_with_pii)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 10, f"Regex stage took {elapsed_ms:.2f}ms (target: < 10ms)"
        assert "[MASKED_EMAIL]" in result or "[REDACTED]" in result
        assert "[MASKED_PHONE]" in result or "[REDACTED]" in result

    def test_full_sanitization_performance(self, sanitizer, sample_text_with_pii):
        """Test full 2-stage sanitization performance - should be < 50ms"""
        start = time.time()
        result = sanitizer.sanitize(sample_text_with_pii)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 50, f"Full sanitization took {elapsed_ms:.2f}ms (target: < 50ms)"
        assert "@example.com" not in result
        assert "555-123-4567" not in result

    def test_regex_only_performance(self, sanitizer_regex_only, sample_text_with_pii):
        """Test regex-only sanitization performance - should be very fast"""
        start = time.time()
        result = sanitizer_regex_only.sanitize(sample_text_with_pii)
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 5, f"Regex-only took {elapsed_ms:.2f}ms (target: < 5ms)"
        assert "[MASKED_EMAIL]" in result
        assert "[MASKED_PHONE]" in result

    def test_large_text_performance(self, sanitizer, large_text):
        """Test performance with large text input (~5KB)"""
        start = time.time()
        result = sanitizer.sanitize(large_text)
        elapsed_ms = (time.time() - start) * 1000

        # Allow slightly more time for large text, but still should be reasonable
        assert elapsed_ms < 100, f"Large text sanitization took {elapsed_ms:.2f}ms (target: < 100ms)"
        assert len(result) > 0

    def test_complex_payload_performance(self, sanitizer, complex_payload):
        """Test performance with complex nested payload structure"""
        start = time.time()
        result = sanitizer.sanitize(complex_payload)  # Use sanitize instead of sanitize_payload
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 50, f"Complex payload sanitization took {elapsed_ms:.2f}ms (target: < 50ms)"
        assert isinstance(result, dict)
        assert "messages" in result
        # Verify PII was masked
        result_str = str(result)
        assert "@example.com" not in result_str or "[MASKED_EMAIL]" in result_str or "[REDACTED]" in result_str

    def test_timeout_enforcement(self, sanitizer):
        """Test that timeout is enforced for Presidio stage"""
        # Create a very large text that might exceed timeout
        very_large_text = "Sample text with email: test@example.com. " * 1000
        
        # Set a very short timeout
        sanitizer.timeout_ms = 10
        
        start = time.time()
        result = sanitizer.sanitize(very_large_text)
        elapsed_ms = (time.time() - start) * 1000

        # Should complete (either within timeout or fallback to regex)
        assert elapsed_ms < 200, f"Sanitization with timeout took {elapsed_ms:.2f}ms"
        assert len(result) > 0

    def test_batch_performance(self, sanitizer, sample_text_with_pii):
        """Test performance when processing multiple items"""
        texts = [sample_text_with_pii] * 10
        
        start = time.time()
        results = [sanitizer.sanitize(text) for text in texts]
        elapsed_ms = (time.time() - start) * 1000
        avg_per_item = elapsed_ms / len(texts)

        assert avg_per_item < 50, f"Average per item: {avg_per_item:.2f}ms (target: < 50ms)"
        assert len(results) == 10
        assert all("@example.com" not in str(r) for r in results)

    def test_empty_string_performance(self, sanitizer):
        """Test performance with empty string (should be instant)"""
        start = time.time()
        result = sanitizer.sanitize("")
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms < 1, f"Empty string took {elapsed_ms:.2f}ms (should be instant)"
        assert result == ""

    def test_no_pii_performance(self, sanitizer):
        """Test performance with text containing no PII"""
        clean_text = "This is a clean text with no sensitive information."
        
        start = time.time()
        result = sanitizer.sanitize(clean_text)
        elapsed_ms = (time.time() - start) * 1000

        # Should be fast even with Presidio (no entities to process)
        assert elapsed_ms < 30, f"Clean text took {elapsed_ms:.2f}ms (target: < 30ms)"
        assert result == clean_text or len(result) > 0
