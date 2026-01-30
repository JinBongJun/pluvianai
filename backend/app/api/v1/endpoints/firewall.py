"""
Firewall API endpoints for Production Guard
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, require_admin
from app.core.decorators import handle_errors
from app.core.dependencies import get_audit_service
from app.models.user import User
from app.models.firewall_rule import FirewallRule, FirewallRuleType, FirewallAction, FirewallSeverity
from app.services.firewall_service import firewall_service
from app.core.logging_config import logger

router = APIRouter()


class FirewallRuleCreate(BaseModel):
    """Schema for creating a firewall rule"""
    rule_type: FirewallRuleType
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    pattern: Optional[str] = None
    pattern_type: Optional[str] = Field(None, pattern="^(regex|keyword|llm)$")
    action: FirewallAction = FirewallAction.BLOCK
    severity: FirewallSeverity = FirewallSeverity.MEDIUM
    enabled: bool = True
    config: Optional[dict] = None


class FirewallRuleUpdate(BaseModel):
    """Schema for updating a firewall rule"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    pattern: Optional[str] = None
    pattern_type: Optional[str] = Field(None, pattern="^(regex|keyword|llm)$")
    action: Optional[FirewallAction] = None
    severity: Optional[FirewallSeverity] = None
    enabled: Optional[bool] = None
    config: Optional[dict] = None


class FirewallRuleResponse(BaseModel):
    """Schema for firewall rule response"""
    id: int
    project_id: int
    rule_type: str
    name: str
    description: Optional[str]
    pattern: Optional[str]
    pattern_type: Optional[str]
    action: str
    severity: str
    enabled: bool
    config: Optional[dict]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class PanicModeRequest(BaseModel):
    """Schema for panic mode toggle"""
    enabled: bool


class PanicModeResponse(BaseModel):
    """Schema for panic mode response"""
    enabled: bool
    message: str


@router.get("/projects/{project_id}/firewall/rules", response_model=List[FirewallRuleResponse])
@handle_errors
async def get_firewall_rules(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all firewall rules for a project"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    rules = firewall_service.get_project_firewall_rules(project_id, db)
    # Also get disabled rules for management UI
    all_rules = (
        db.query(FirewallRule)
        .filter(FirewallRule.project_id == project_id)
        .order_by(FirewallRule.created_at.desc())
        .all()
    )

    return all_rules


@router.post("/projects/{project_id}/firewall/rules", status_code=status.HTTP_201_CREATED)
async def create_firewall_rule(
    project_id: int,
    rule_data: FirewallRuleCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new firewall rule"""
    try:
        # Verify project access
        check_project_access(project_id, current_user, db)

        # Create new rule
        rule = FirewallRule(
            project_id=project_id,
            rule_type=rule_data.rule_type,
            name=rule_data.name,
            description=rule_data.description,
            pattern=rule_data.pattern,
            pattern_type=rule_data.pattern_type,
            action=rule_data.action,
            severity=rule_data.severity,
            enabled=rule_data.enabled,
            config=rule_data.config
        )

        db.add(rule)
        db.commit()
        db.refresh(rule)
        
        logger.info(f"Firewall rule created: {rule.id} for project {project_id} by user {current_user.id}")

        # Return as dict to avoid serialization issues
        return {
            "id": rule.id,
            "project_id": rule.project_id,
            "rule_type": rule.rule_type.value if rule.rule_type else None,
            "name": rule.name,
            "description": rule.description,
            "pattern": rule.pattern,
            "pattern_type": rule.pattern_type,
            "action": rule.action.value if rule.action else None,
            "severity": rule.severity.value if rule.severity else None,
            "enabled": rule.enabled,
            "config": rule.config,
            "created_at": str(rule.created_at) if rule.created_at else None,
            "updated_at": str(rule.updated_at) if rule.updated_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating firewall rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create firewall rule: {str(e)}"
        )


@router.put("/projects/{project_id}/firewall/rules/{rule_id}", response_model=FirewallRuleResponse)
@handle_errors
async def update_firewall_rule(
    project_id: int,
    rule_id: int,
    rule_data: FirewallRuleUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service),
):
    """Update a firewall rule"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Get rule
    rule = db.query(FirewallRule).filter(
        FirewallRule.id == rule_id,
        FirewallRule.project_id == project_id
    ).first()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Firewall rule not found"
        )

    # Update fields
    if rule_data.name is not None:
        rule.name = rule_data.name
    if rule_data.description is not None:
        rule.description = rule_data.description
    if rule_data.pattern is not None:
        rule.pattern = rule_data.pattern
    if rule_data.pattern_type is not None:
        rule.pattern_type = rule_data.pattern_type
    if rule_data.action is not None:
        rule.action = rule_data.action
    if rule_data.severity is not None:
        rule.severity = rule_data.severity
    if rule_data.enabled is not None:
        rule.enabled = rule_data.enabled
    if rule_data.config is not None:
        rule.config = rule_data.config

    # Save old values for audit log
    old_value = {
        "name": rule.name,
        "description": rule.description,
        "pattern": rule.pattern,
        "pattern_type": rule.pattern_type,
        "action": rule.action.value if rule.action else None,
        "severity": rule.severity.value if rule.severity else None,
        "enabled": rule.enabled,
        "config": rule.config
    }
    
    # Commit handled automatically by get_db() dependency
    db.refresh(rule)

    logger.info(f"Firewall rule updated: {rule_id} for project {project_id} by user {current_user.id}")

    # Log audit event
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    new_value = rule_data.dict(exclude_unset=True)
    audit_service.log_action(
        user_id=current_user.id,
        action="firewall_rule_updated",
        resource_type="firewall_rule",
        resource_id=rule_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return rule


@router.delete("/projects/{project_id}/firewall/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_firewall_rule(
    project_id: int,
    rule_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    audit_service = Depends(get_audit_service),
):
    """Delete a firewall rule"""
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Get rule
    rule = db.query(FirewallRule).filter(
        FirewallRule.id == rule_id,
        FirewallRule.project_id == project_id
    ).first()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Firewall rule not found"
        )

    # Save old value for audit log
    old_value = {
        "name": rule.name,
        "rule_type": rule.rule_type.value if rule.rule_type else None,
        "action": rule.action.value if rule.action else None,
        "severity": rule.severity.value if rule.severity else None
    }

    db.delete(rule)
    # Commit handled automatically by get_db() dependency

    logger.info(f"Firewall rule deleted: {rule_id} for project {project_id} by user {current_user.id}")

    # Log audit event
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    audit_service.log_action(
        user_id=current_user.id,
        action="firewall_rule_deleted",
        resource_type="firewall_rule",
        resource_id=rule_id,
        old_value=old_value,
        ip_address=ip_address,
        user_agent=user_agent
    )


@router.post("/admin/firewall/panic-mode", response_model=PanicModeResponse)
@handle_errors
async def toggle_panic_mode(
    request: PanicModeRequest,
    current_user: User = Depends(get_current_user),
):
    """Toggle global panic mode (Admin only)"""
    # Require admin access
    require_admin(current_user)

    success = firewall_service.set_global_panic_mode(request.enabled)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set panic mode"
        )

    message = "Panic mode enabled. All traffic is blocked." if request.enabled else "Panic mode disabled. Traffic is allowed."
    logger.warning(f"Global panic mode toggled to {request.enabled} by admin user {current_user.id}")

    return PanicModeResponse(
        enabled=request.enabled,
        message=message
    )


@router.get("/admin/firewall/panic-mode", response_model=PanicModeResponse)
@handle_errors
async def get_panic_mode_status(
    current_user: User = Depends(get_current_user),
):
    """Get global panic mode status (Admin only)"""
    # Require admin access
    require_admin(current_user)

    is_enabled = await firewall_service.check_global_panic_mode()

    return PanicModeResponse(
        enabled=is_enabled,
        message="Panic mode is active" if is_enabled else "Panic mode is inactive"
    )
