"""
Organizations API endpoints
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.core.decorators import handle_errors

router = APIRouter()


class OrganizationCreate(BaseModel):
    """Organization creation schema"""

    name: str = Field(..., min_length=1, max_length=255, description="Organization name")
    type: Optional[str] = Field(None, description="Organization type")
    plan_type: str = Field("free", description="Plan type (always 'free' for new orgs)")


class OrganizationUpdate(BaseModel):
    """Organization update schema"""

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Organization name")
    type: Optional[str] = Field(None, description="Organization type")


class OrganizationResponse(BaseModel):
    """Organization response schema"""

    id: int
    name: str
    type: Optional[str]
    plan_type: str
    owner_id: int
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


@router.get("", response_model=List[OrganizationResponse])
@handle_errors
async def list_organizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all organizations the user belongs to"""
    # Get organizations where user is a member
    org_members = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == current_user.id)
        .all()
    )
    
    org_ids = [member.organization_id for member in org_members]
    organizations = db.query(Organization).filter(Organization.id.in_(org_ids)).all()
    
    return organizations


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
@handle_errors
async def create_organization(
    org_data: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new organization"""
    # Validate name
    if not org_data.name or not org_data.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name is required"
        )
    
    # Check for duplicate name (same user)
    existing = (
        db.query(Organization)
        .join(OrganizationMember)
        .filter(
            Organization.name == org_data.name.strip(),
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.role == "owner"
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organization with this name already exists"
        )
    
    # Create organization
    org = Organization(
        name=org_data.name.strip(),
        type=org_data.type if org_data.type else None,
        plan_type="free",  # Always start with free plan
        owner_id=current_user.id
    )
    db.add(org)
    db.flush()  # Get the org.id
    
    # Create organization member (owner role)
    member = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role="owner",
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(org)
    
    return org


@router.get("/{org_id}", response_model=OrganizationResponse)
@handle_errors
async def get_organization(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get organization details"""
    # Check if user is a member
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id
        )
        .first()
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    return org


@router.patch("/{org_id}", response_model=OrganizationResponse)
@handle_errors
async def update_organization(
    org_id: int,
    org_data: OrganizationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update organization (owner/admin only)"""
    # Check if user is owner or admin
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.role.in_(["owner", "admin"])
        )
        .first()
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this organization"
        )
    
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Update fields
    if org_data.name is not None:
        org.name = org_data.name.strip()
    if org_data.type is not None:
        org.type = org_data.type
    
    db.commit()
    db.refresh(org)
    
    return org


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
@handle_errors
async def delete_organization(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete organization (owner only)"""
    # Check if user is owner
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.role == "owner"
        )
        .first()
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete the organization"
        )
    
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    db.delete(org)
    db.commit()
    
    return None
