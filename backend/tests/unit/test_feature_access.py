"""
Unit tests for feature_access module
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from app.core.feature_access import check_feature_access, get_required_plan_for_feature
from app.core.exceptions import UpgradeRequiredException
from app.models.subscription import Subscription


@pytest.mark.unit
class TestFeatureAccess:
    """Tests for feature access checking"""

    @patch('app.core.feature_access.SubscriptionService')
    def test_check_feature_access_allowed(self, mock_sub_service_class, db, test_user):
        """Test feature access when user has required plan"""
        mock_sub_service = MagicMock()
        mock_sub_service_class.return_value = mock_sub_service
        
        # Mock user has Pro plan and access
        mock_sub_service.get_user_plan.return_value = {"plan_type": "pro"}
        mock_sub_service.check_feature_access.return_value = True
        
        result = check_feature_access(db, test_user.id, "auto_mapping", "pro")
        
        assert result is True
        assert mock_sub_service.get_user_plan.called
        assert mock_sub_service.check_feature_access.called

    @patch('app.core.feature_access.SubscriptionService')
    def test_check_feature_access_denied(self, mock_sub_service_class, db, test_user):
        """Test feature access when user doesn't have required plan"""
        mock_sub_service = MagicMock()
        mock_sub_service_class.return_value = mock_sub_service
        
        # Mock user has Free plan and no access
        mock_sub_service.get_user_plan.return_value = {"plan_type": "free"}
        mock_sub_service.check_feature_access.return_value = False
        
        with pytest.raises(UpgradeRequiredException) as exc_info:
            check_feature_access(db, test_user.id, "auto_mapping", "pro")
        
        assert exc_info.value.current_plan == "free"
        assert exc_info.value.required_plan == "pro"
        assert exc_info.value.feature == "auto_mapping"
        assert "auto_mapping" in exc_info.value.message

    @patch('app.core.feature_access.SubscriptionService')
    def test_check_feature_access_enterprise(self, mock_sub_service_class, db, test_user):
        """Test feature access with Enterprise plan"""
        mock_sub_service = MagicMock()
        mock_sub_service_class.return_value = mock_sub_service
        
        # Mock user has Enterprise plan
        mock_sub_service.get_user_plan.return_value = {"plan_type": "enterprise"}
        mock_sub_service.check_feature_access.return_value = True
        
        result = check_feature_access(db, test_user.id, "self_hosted", "enterprise")
        
        assert result is True

    @patch('app.core.feature_access.SubscriptionService')
    def test_check_feature_access_raises_exception(self, mock_sub_service_class, db, test_user):
        """Test that UpgradeRequiredException is raised with correct attributes"""
        mock_sub_service = MagicMock()
        mock_sub_service_class.return_value = mock_sub_service
        
        mock_sub_service.get_user_plan.return_value = {"plan_type": "free"}
        mock_sub_service.check_feature_access.return_value = False
        
        with pytest.raises(UpgradeRequiredException) as exc_info:
            check_feature_access(db, test_user.id, "production_guard", "pro", "Custom message")
        
        exception = exc_info.value
        assert exception.current_plan == "free"
        assert exception.required_plan == "pro"
        assert exception.feature == "production_guard"
        assert exception.message == "Custom message"
        assert exception.upgrade_url is not None

    @patch('app.core.feature_access.SubscriptionService')
    def test_check_feature_access_custom_message(self, mock_sub_service_class, db, test_user):
        """Test feature access with custom error message"""
        mock_sub_service = MagicMock()
        mock_sub_service_class.return_value = mock_sub_service
        
        mock_sub_service.get_user_plan.return_value = {"plan_type": "free"}
        mock_sub_service.check_feature_access.return_value = False
        
        custom_message = "Please upgrade to Pro to use this feature"
        
        with pytest.raises(UpgradeRequiredException) as exc_info:
            check_feature_access(db, test_user.id, "auto_mapping", "pro", custom_message)
        
        assert exc_info.value.message == custom_message

    def test_get_required_plan_for_feature_known_feature(self):
        """Test getting required plan for known feature"""
        result = get_required_plan_for_feature("auto_mapping")
        assert result == "pro"
        
        result = get_required_plan_for_feature("self_hosted")
        assert result == "enterprise"
        
        result = get_required_plan_for_feature("alerts")
        assert result == "indie"

    def test_get_required_plan_for_feature_unknown_feature(self):
        """Test getting required plan for unknown feature"""
        result = get_required_plan_for_feature("unknown_feature")
        assert result is None

    def test_get_required_plan_for_feature_all_features(self):
        """Test all defined features have required plans"""
        features = {
            "auto_mapping": "pro",
            "production_guard": "pro",
            "enhanced_quality": "startup",
            "alerts": "indie",
            "multi_model_comparison": "startup",
            "weekly_reports": "startup",
            "advanced_cost_optimizer": "pro",
            "region_latency": "pro",
            "rbac": "pro",
            "self_hosted": "enterprise",
            "dedicated_support": "enterprise",
            "sla": "enterprise",
            "data_masking": "enterprise",
            "custom_evaluator_rules": "enterprise",
        }
        
        for feature, expected_plan in features.items():
            result = get_required_plan_for_feature(feature)
            assert result == expected_plan, f"Feature {feature} should require {expected_plan}"

    @patch('app.core.feature_access.SubscriptionService')
    def test_check_feature_access_startup_plan(self, mock_sub_service_class, db, test_user):
        """Test feature access with Startup plan"""
        mock_sub_service = MagicMock()
        mock_sub_service_class.return_value = mock_sub_service
        
        mock_sub_service.get_user_plan.return_value = {"plan_type": "startup"}
        mock_sub_service.check_feature_access.return_value = True
        
        # Startup should have access to startup-level features
        result = check_feature_access(db, test_user.id, "enhanced_quality", "startup")
        assert result is True
        
        # But not to pro-level features
        mock_sub_service.check_feature_access.return_value = False
        with pytest.raises(UpgradeRequiredException):
            check_feature_access(db, test_user.id, "auto_mapping", "pro")
