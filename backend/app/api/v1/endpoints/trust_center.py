"""
Trust Center endpoints for security and compliance transparency
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any
from app.core.database import get_db
from app.core.decorators import handle_errors

router = APIRouter()


class SecurityPoliciesResponse(BaseModel):
    """Response schema for security policies"""
    data_encryption: Dict[str, Any]
    access_control: Dict[str, Any]
    data_retention: Dict[str, Any]
    compliance: Dict[str, Any]


class ComplianceStatusResponse(BaseModel):
    """Response schema for compliance status"""
    gdpr: Dict[str, Any]
    soc2: Dict[str, Any]
    ccpa: Dict[str, Any]


@router.get("/policies", response_model=SecurityPoliciesResponse)
@handle_errors
async def get_security_policies(
    db: Session = Depends(get_db),
):
    """Get security policies"""
    return SecurityPoliciesResponse(
        data_encryption={
            "at_rest": "AES-256-GCM",
            "in_transit": "TLS 1.3",
            "key_management": "AWS KMS",
        },
        access_control={
            "authentication": "JWT with refresh tokens",
            "authorization": "RBAC/ABAC",
            "api_keys": "Hashed and encrypted",
        },
        data_retention={
            "free": "7 days",
            "pro": "30 days",
            "enterprise": "90 days",
            "auto_archiving": "S3 Glacier (Enterprise)",
        },
        compliance={
            "gdpr": "Compliant",
            "ccpa": "Compliant",
            "soc2": "In progress (Type 1 Q2 2024, Type 2 Q4 2024)",
        },
    )


@router.get("/compliance", response_model=ComplianceStatusResponse)
@handle_errors
async def get_compliance_status(
    db: Session = Depends(get_db),
):
    """Get compliance status"""
    return ComplianceStatusResponse(
        gdpr={
            "status": "Compliant",
            "data_processing_agreement": "Available on request",
            "right_to_erasure": "Supported via data export",
            "data_portability": "Supported via JSON/CSV export",
        },
        soc2={
            "status": "In Progress",
            "type1_target": "Q2 2024",
            "type2_target": "Q4 2024",
            "current_phase": "Preparation",
        },
        ccpa={
            "status": "Compliant",
            "data_sale": "We do not sell user data",
            "opt_out": "Available in settings",
        },
    )
