"""
Rule Market endpoints for sharing firewall rules
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.rule_market import RuleMarket
from app.services.rule_market_service import RuleMarketService

router = APIRouter()


class RuleMarketCreateRequest(BaseModel):
    """Request schema for creating a rule in the market"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    rule_type: str = Field(..., pattern="^(pii|toxicity|hallucination|custom)$")
    pattern: str = Field(..., min_length=1)
    pattern_type: str = Field(..., pattern="^(regex|keyword|ml)$")
    category: Optional[str] = Field(None, max_length=100)
    tags: List[str] = Field(default=[])


class RuleMarketResponse(BaseModel):
    """Response schema for rule market"""
    id: int
    author_id: int
    name: str
    description: Optional[str]
    rule_type: str
    pattern: str
    pattern_type: str
    category: Optional[str]
    tags: List[str]
    download_count: int
    rating: float
    rating_count: int
    is_approved: bool
    is_featured: bool
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class RuleDownloadRequest(BaseModel):
    """Request schema for downloading a rule"""
    project_id: int


class RuleRateRequest(BaseModel):
    """Request schema for rating a rule"""
    rating: float = Field(..., ge=1, le=5)


def get_rule_market_service(db: Session = Depends(get_db)) -> RuleMarketService:
    """Dependency to get rule market service"""
    return RuleMarketService()


@router.get("/rule-market", response_model=List[RuleMarketResponse])
@handle_errors
async def list_rules(
    category: Optional[str] = Query(None, description="Filter by category"),
    rule_type: Optional[str] = Query(None, description="Filter by rule type"),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    sort: str = Query("popular", description="Sort order: popular, recent, rating"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
    rule_market_service: RuleMarketService = Depends(get_rule_market_service),
):
    """
    List rules from the market (public endpoint, authentication optional)
    """
    # Parse tags if provided
    tag_list = [t.strip() for t in tags.split(",")] if tags else None

    result = rule_market_service.list_rules(
        db=db,
        category=category,
        rule_type=rule_type,
        tags=tag_list,
        search=search,
        sort=sort,
        limit=limit,
        offset=offset,
        approved_only=True
    )

    # Return as list directly (not wrapped in success_response for list endpoints)
    return result["rules"]


@router.get("/rule-market/featured", response_model=List[RuleMarketResponse])
@handle_errors
async def get_featured_rules(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    rule_market_service: RuleMarketService = Depends(get_rule_market_service),
):
    """
    Get featured rules (public endpoint)
    """
    rules = rule_market_service.get_featured_rules(db, limit)
    return rules


@router.get("/rule-market/{rule_id}", response_model=RuleMarketResponse)
@handle_errors
async def get_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    rule_market_service: RuleMarketService = Depends(get_rule_market_service),
):
    """
    Get a rule by ID (public endpoint)
    """
    rule = rule_market_service.get_rule_by_id(rule_id, db)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    if not rule.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rule is not approved"
        )

    return success_response(data=rule)


@router.post("/rule-market", response_model=RuleMarketResponse)
@handle_errors
async def create_rule(
    request: RuleMarketCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rule_market_service: RuleMarketService = Depends(get_rule_market_service),
):
    """
    Create a new rule in the market (requires authentication)
    """
    rule = rule_market_service.create_rule(
        user_id=current_user.id,
        name=request.name,
        description=request.description,
        rule_type=request.rule_type,
        pattern=request.pattern,
        pattern_type=request.pattern_type,
        category=request.category,
        tags=request.tags,
        db=db
    )

    return success_response(data=rule)


@router.post("/rule-market/{rule_id}/download", response_model=dict)
@handle_errors
async def download_rule(
    rule_id: int,
    request: RuleDownloadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rule_market_service: RuleMarketService = Depends(get_rule_market_service),
):
    """
    Download a rule from the market and add it to a project
    """
    # Verify project access
    check_project_access(request.project_id, current_user, db)

    try:
        firewall_rule = rule_market_service.download_rule(rule_id, request.project_id, db)
        return success_response(
            data={
                "message": "Rule downloaded successfully",
                "firewall_rule_id": firewall_rule.id
            }
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/rule-market/{rule_id}/rate", response_model=RuleMarketResponse)
@handle_errors
async def rate_rule(
    rule_id: int,
    request: RuleRateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rule_market_service: RuleMarketService = Depends(get_rule_market_service),
):
    """
    Rate a rule (1-5 stars)
    """
    try:
        rule = rule_market_service.rate_rule(rule_id, current_user.id, request.rating, db)
        return success_response(data=rule)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
