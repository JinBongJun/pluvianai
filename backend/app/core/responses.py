"""
Standard API response wrappers
Following API_REFERENCE.md format: {"data": {...}, "meta": {...}}
"""

from typing import Any, Dict, Optional, List

from fastapi import status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def success_response(
    data: Any = None,
    meta: Optional[Dict[str, Any]] = None,
    status_code: int = status.HTTP_200_OK,
    headers: Optional[Dict[str, str]] = None,
) -> JSONResponse:
    """
    Create a standard success response following API_REFERENCE.md format.

    This helper is used across many endpoints, so we also take care of
    serializing Pydantic models, datetime objects, etc. using
    `fastapi.encoders.jsonable_encoder` before returning the JSONResponse.
    """
    response_content: Dict[str, Any] = {}

    if data is not None:
        response_content["data"] = data

    if meta is not None:
        response_content["meta"] = meta

    # If no data or meta, return empty dict (will be {"data": None} if data is None)
    if not response_content and data is None:
        response_content["data"] = None

    default_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }

    if headers:
        default_headers.update(headers)

    # Ensure everything is JSON-serializable (handles datetime, Pydantic models, etc.)
    encoded_content = jsonable_encoder(response_content)

    return JSONResponse(
        status_code=status_code,
        content=encoded_content,
        headers=default_headers,
    )


def error_response(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    origin: Optional[str] = None,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    headers: Optional[Dict[str, str]] = None,
) -> JSONResponse:
    """
    Create a standard error response following API_REFERENCE.md format
    
    Args:
        code: Error code (e.g., "PROJECT_NOT_FOUND")
        message: Error message
        details: Optional error details
        origin: Error origin (Proxy, Upstream, Network)
        status_code: HTTP status code (default: 400)
        headers: Optional custom headers
    
    Returns:
        JSONResponse with standard format: {"error": {"code": "...", "message": "...", ...}}
    """
    error_content: Dict[str, Any] = {
        "code": code,
        "message": message,
    }
    
    if details:
        error_content["details"] = details
    
    if origin:
        error_content["origin"] = origin
    
    default_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    
    # Add X-PluvianAI-Origin header for Error Namespace consistency
    if origin:
        default_headers["X-PluvianAI-Origin"] = origin
    else:
        default_headers["X-PluvianAI-Origin"] = "Proxy"
    
    if headers:
        default_headers.update(headers)
    
    return JSONResponse(
        status_code=status_code,
        content={"error": error_content},
        headers=default_headers,
    )


def paginated_response(
    data: List[Any],
    page: int,
    per_page: int,
    total: int,
    status_code: int = status.HTTP_200_OK,
    headers: Optional[Dict[str, str]] = None,
) -> JSONResponse:
    """
    Create a paginated response with standard format
    
    Args:
        data: List of items for current page
        page: Current page number (1-indexed)
        per_page: Items per page
        total: Total number of items
        status_code: HTTP status code
        headers: Optional custom headers
    
    Returns:
        JSONResponse with {"data": [...], "meta": {"page": 1, "per_page": 20, "total": 100, "total_pages": 5}}
    """
    total_pages = (total + per_page - 1) // per_page if total > 0 else 0
    
    meta = {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": total_pages,
    }
    
    return success_response(data=data, meta=meta, status_code=status_code, headers=headers)
