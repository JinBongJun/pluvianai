"""
Unit tests for test_limits module (plan limit checks for Replay/Regression).
"""
import pytest
from fastapi import HTTPException

from app.core.test_limits import check_test_run_limits
from app.core.subscription_limits import PLAN_LIMITS


@pytest.mark.unit
class TestTestLimits:
    """Tests for check_test_run_limits (input_prompts_per_test, total_calls_per_single_test)."""

    def test_under_limits_passes(self, db, test_user):
        """When input_count and estimated_calls are within free plan limits, no exception."""
        free_limits = PLAN_LIMITS["free"]
        input_limit = free_limits["input_prompts_per_test"]
        calls_limit = free_limits["total_calls_per_single_test"]

        check_test_run_limits(
            db,
            test_user.id,
            input_count=input_limit,
            estimated_calls=calls_limit,
        )
        # No exception

    def test_over_input_limit_raises_403(self, db, test_user):
        """When input_count exceeds input_prompts_per_test, raise 403 with LIMIT_INPUTS_PER_TEST."""
        free_limits = PLAN_LIMITS["free"]
        input_limit = free_limits["input_prompts_per_test"]

        with pytest.raises(HTTPException) as exc_info:
            check_test_run_limits(
                db,
                test_user.id,
                input_count=input_limit + 1,
                estimated_calls=input_limit,
            )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "LIMIT_INPUTS_PER_TEST"
        assert exc_info.value.detail["limit"] == input_limit
        assert exc_info.value.detail["requested"] == input_limit + 1
        assert "Input limit exceeded" in exc_info.value.detail["message"]

    def test_over_calls_limit_raises_403(self, db, test_user):
        """When estimated_calls exceeds total_calls_per_single_test, raise 403 with LIMIT_TOTAL_CALLS_PER_TEST."""
        free_limits = PLAN_LIMITS["free"]
        calls_limit = free_limits["total_calls_per_single_test"]

        with pytest.raises(HTTPException) as exc_info:
            check_test_run_limits(
                db,
                test_user.id,
                input_count=1,
                estimated_calls=calls_limit + 1,
            )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "LIMIT_TOTAL_CALLS_PER_TEST"
        assert exc_info.value.detail["limit"] == calls_limit
        assert exc_info.value.detail["requested"] == calls_limit + 1
        assert "Estimated calls" in exc_info.value.detail["message"]
