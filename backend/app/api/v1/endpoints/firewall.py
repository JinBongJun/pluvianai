from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, check_project_write_access
from app.models.user import User
from app.models.firewall_rule import FirewallRule, FirewallRuleType, FirewallAction, FirewallSeverity
from app.services.firewall_service import firewall_service

router = APIRouter()

# Path prefix when mounted: /projects (full path e.g. /api/v1/projects/{project_id}/firewall/rules)


class FirewallRuleCreate(BaseModel):
    name: str
    rule_type: FirewallRuleType
    action: FirewallAction
    severity: FirewallSeverity = FirewallSeverity.MEDIUM
    pattern: Optional[str] = None
    enabled: bool = True


class FirewallRuleUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[FirewallRuleType] = None
    action: Optional[FirewallAction] = None
    severity: Optional[FirewallSeverity] = None
    pattern: Optional[str] = None
    enabled: Optional[bool] = None


class FirewallRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    rule_type: FirewallRuleType
    action: FirewallAction
    severity: FirewallSeverity
    pattern: Optional[str]
    enabled: bool

@router.get("/{project_id}/firewall/rules", response_model=List[FirewallRuleResponse])
def list_rules(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all firewall rules for a project."""
    check_project_access(project_id, current_user, db)
    rules = db.query(FirewallRule).filter(FirewallRule.project_id == project_id).all()
    return rules


@router.post("/{project_id}/firewall/rules", response_model=FirewallRuleResponse)
def create_rule(
    project_id: int,
    payload: FirewallRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new firewall rule."""
    check_project_write_access(project_id, current_user, db, action_label="Creating firewall rules")
    rule = FirewallRule(
        project_id=project_id,
        name=payload.name,
        rule_type=payload.rule_type,
        action=payload.action,
        severity=payload.severity,
        pattern=payload.pattern,
        enabled=payload.enabled,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/{project_id}/firewall/rules/{rule_id}", response_model=FirewallRuleResponse)
def update_rule(
    project_id: int,
    rule_id: int,
    payload: FirewallRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing firewall rule; rule must belong to the given project."""
    check_project_write_access(project_id, current_user, db, action_label="Updating firewall rules")
    rule = (
        db.query(FirewallRule)
        .filter(FirewallRule.project_id == project_id, FirewallRule.id == rule_id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{project_id}/firewall/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    project_id: int,
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a firewall rule; rule must belong to the given project."""
    check_project_write_access(project_id, current_user, db, action_label="Deleting firewall rules")
    rule = (
        db.query(FirewallRule)
        .filter(FirewallRule.project_id == project_id, FirewallRule.id == rule_id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return None


@router.post("/{project_id}/firewall/rules/{rule_id}/toggle", response_model=FirewallRuleResponse)
def toggle_rule(
    project_id: int,
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle a firewall rule enabled/disabled status; rule must belong to the given project."""
    check_project_write_access(project_id, current_user, db, action_label="Updating firewall rules")
    rule = (
        db.query(FirewallRule)
        .filter(FirewallRule.project_id == project_id, FirewallRule.id == rule_id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.enabled = not rule.enabled
    db.commit()
    db.refresh(rule)
    return rule
