"""
Unit tests for UpgradeRequiredException and exception handlers
"""
import pytest
from unittest.mock import Mock, MagicMock, patch
from fastapi import Request
from app.core.exceptions import (
    UpgradeRequiredException,
    PluvianAIException,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
    pluvianai_exception_handler,
)


@pytest.mark.unit
class TestUpgradeRequiredException:
    """Tests for UpgradeRequiredException"""

    def test_upgrade_exception_creation(self):
        """Test creating UpgradeRequiredException with all attributes"""
        exc = UpgradeRequiredException(
            message="Upgrade required",
            current_plan="free",
            required_plan="pro",
            feature="auto_mapping",
            upgrade_url="/upgrade"
        )
        
        assert exc.message == "Upgrade required"
        assert exc.status_code == 403
        assert exc.current_plan == "free"
        assert exc.required_plan == "pro"
        assert exc.feature == "auto_mapping"
        assert exc.upgrade_url == "/upgrade"

    def test_upgrade_exception_default_url(self):
        """Test UpgradeRequiredException generates default upgrade URL"""
        exc = UpgradeRequiredException(
            message="Upgrade required",
            current_plan="free",
            required_plan="pro",
            feature="auto_mapping"
        )
        
        assert exc.upgrade_url == "/settings/billing?upgrade=pro"

    def test_upgrade_exception_defaults(self):
        """Test UpgradeRequiredException with default values"""
        exc = UpgradeRequiredException()
        
        assert exc.message == "This feature requires a higher plan"
        assert exc.current_plan == "free"
        assert exc.required_plan == "pro"
        assert exc.feature is None
        assert exc.status_code == 403

    @pytest.mark.asyncio
    async def test_upgrade_exception_handler(self):
        """Test exception handler for UpgradeRequiredException"""
        exc = UpgradeRequiredException(
            message="Upgrade to Pro required",
            current_plan="free",
            required_plan="pro",
            feature="auto_mapping"
        )
        
        request = MagicMock(spec=Request)
        request.url.path = "/api/v1/projects/1/auto-mapping"
        request.method = "GET"
        
        with patch('app.core.responses.error_response') as mock_error_response:
            mock_response = MagicMock()
            mock_error_response.return_value = mock_response
            
            result = await pluvianai_exception_handler(request, exc)
            
            assert mock_error_response.called
            call_args = mock_error_response.call_args
            
            # Check error response parameters
            assert call_args.kwargs["code"] == "UPGRADE_REQUIRED"
            assert call_args.kwargs["message"] == "Upgrade to Pro required"
            assert call_args.kwargs["status_code"] == 403
            assert "headers" in call_args.kwargs
            assert call_args.kwargs["headers"]["X-Upgrade-Required"] == "true"
            
            # Check details
            details = call_args.kwargs["details"]
            assert details["current_plan"] == "free"
            assert details["required_plan"] == "pro"
            assert details["feature"] == "auto_mapping"
            assert "upgrade_url" in details

    @pytest.mark.asyncio
    async def test_upgrade_exception_headers(self):
        """Test that X-Upgrade-Required header is set"""
        exc = UpgradeRequiredException(
            message="Upgrade required",
            current_plan="free",
            required_plan="pro"
        )
        
        request = MagicMock(spec=Request)
        request.url.path = "/api/v1/test"
        request.method = "GET"
        
        with patch('app.core.responses.error_response') as mock_error_response:
            mock_response = MagicMock()
            mock_error_response.return_value = mock_response
            
            await pluvianai_exception_handler(request, exc)
            
            call_args = mock_error_response.call_args
            headers = call_args.kwargs["headers"]
            assert headers["X-Upgrade-Required"] == "true"

    @pytest.mark.asyncio
    async def test_pluvianai_exception_handler_not_found(self):
        """Test exception handler for NotFoundError"""
        exc = NotFoundError("Resource not found")
        
        request = MagicMock(spec=Request)
        request.url.path = "/api/v1/projects/999"
        request.method = "GET"
        
        with patch('app.core.responses.error_response') as mock_error_response:
            mock_response = MagicMock()
            mock_error_response.return_value = mock_response
            
            await pluvianai_exception_handler(request, exc)
            
            call_args = mock_error_response.call_args
            assert call_args.kwargs["code"] == "NOT_FOUND"
            assert call_args.kwargs["status_code"] == 404

    @pytest.mark.asyncio
    async def test_pluvianai_exception_handler_permission_denied(self):
        """Test exception handler for PermissionDeniedError"""
        exc = PermissionDeniedError("Access denied")
        
        request = MagicMock(spec=Request)
        request.url.path = "/api/v1/projects/1"
        request.method = "DELETE"
        
        with patch('app.core.responses.error_response') as mock_error_response:
            mock_response = MagicMock()
            mock_error_response.return_value = mock_response
            
            await pluvianai_exception_handler(request, exc)
            
            call_args = mock_error_response.call_args
            assert call_args.kwargs["code"] == "PERMISSION_DENIED"
            assert call_args.kwargs["status_code"] == 403

    @pytest.mark.asyncio
    async def test_pluvianai_exception_handler_validation_error(self):
        """Test exception handler for ValidationError"""
        exc = ValidationError("Invalid input")
        
        request = MagicMock(spec=Request)
        request.url.path = "/api/v1/projects"
        request.method = "POST"
        
        with patch('app.core.responses.error_response') as mock_error_response:
            mock_response = MagicMock()
            mock_error_response.return_value = mock_response
            
            await pluvianai_exception_handler(request, exc)
            
            call_args = mock_error_response.call_args
            assert call_args.kwargs["code"] == "VALIDATION_ERROR"
            assert call_args.kwargs["status_code"] == 400

    @pytest.mark.asyncio
    async def test_pluvianai_exception_handler_generic(self):
        """Test exception handler for generic PluvianAIException"""
        exc = PluvianAIException("Generic error", status_code=500)
        
        request = MagicMock(spec=Request)
        request.url.path = "/api/v1/test"
        request.method = "GET"
        
        with patch('app.core.responses.error_response') as mock_error_response:
            mock_response = MagicMock()
            mock_error_response.return_value = mock_response
            
            await pluvianai_exception_handler(request, exc)
            
            call_args = mock_error_response.call_args
            assert call_args.kwargs["code"] == "PLUVIANAI_ERROR"
            assert call_args.kwargs["status_code"] == 500
