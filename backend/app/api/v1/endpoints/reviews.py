"""
Reviews API endpoints - Human-in-the-loop workflow
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.models.user import User
from app.services.review_service import ReviewService

router = APIRouter()


# Request/Response Models

class ReviewResponse(BaseModel):
    id: int
    project_id: int
    replay_id: Optional[int]
    title: str
    description: Optional[str]
    status: str
    regression_status: str
    signals_detected: Optional[dict]
    affected_cases: int
    reviewer_id: Optional[int]
    decision: Optional[str]
    decision_note: Optional[str]
    model_before: Optional[str]
    model_after: Optional[str]
    test_count: int
    passed_count: int
    failed_count: int
    created_at: Optional[str]
    reviewed_at: Optional[str]

    class Config:
        from_attributes = True


class ReviewCreate(BaseModel):
    title: str = Field(..., description="Review title")
    description: Optional[str] = None
    replay_id: Optional[int] = None
    signals_detected: Optional[dict] = None
    model_before: Optional[str] = None
    model_after: Optional[str] = None


class ReviewDecision(BaseModel):
    decision_note: Optional[str] = None


class CommentCreate(BaseModel):
    content: str = Field(..., description="Comment content")


class CommentResponse(BaseModel):
    id: int
    review_id: int
    user_id: Optional[int]
    content: str
    is_system: bool
    created_at: Optional[str]

    class Config:
        from_attributes = True


class ReviewCaseResponse(BaseModel):
    id: int
    review_id: int
    snapshot_id: Optional[int]
    prompt: str
    response_before: Optional[str]
    response_after: Optional[str]
    signals: Optional[dict]
    status: str
    manually_reviewed: bool
    manual_status: Optional[str]
    reviewer_note: Optional[str]

    class Config:
        from_attributes = True


class ReviewStatsResponse(BaseModel):
    total: int
    pending: int
    approved: int
    rejected: int
    needs_discussion: int
    by_regression_status: dict


# Endpoints

@router.get("/projects/{project_id}/reviews", response_model=List[ReviewResponse])
async def list_reviews(
    project_id: int,
    status: Optional[str] = None,
    regression_status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get reviews for a project"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    reviews = service.get_reviews(
        project_id=project_id,
        status=status,
        regression_status=regression_status,
        limit=limit,
        offset=offset,
    )
    
    return [
        ReviewResponse(
            id=r.id,
            project_id=r.project_id,
            replay_id=r.replay_id,
            title=r.title,
            description=r.description,
            status=r.status,
            regression_status=r.regression_status,
            signals_detected=r.signals_detected,
            affected_cases=r.affected_cases,
            reviewer_id=r.reviewer_id,
            decision=r.decision,
            decision_note=r.decision_note,
            model_before=r.model_before,
            model_after=r.model_after,
            test_count=r.test_count,
            passed_count=r.passed_count,
            failed_count=r.failed_count,
            created_at=r.created_at.isoformat() if r.created_at else None,
            reviewed_at=r.reviewed_at.isoformat() if r.reviewed_at else None,
        )
        for r in reviews
    ]


@router.get("/projects/{project_id}/reviews/pending", response_model=List[ReviewResponse])
async def list_pending_reviews(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get pending reviews for a project"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    reviews = service.get_pending_reviews(project_id)
    
    return [
        ReviewResponse(
            id=r.id,
            project_id=r.project_id,
            replay_id=r.replay_id,
            title=r.title,
            description=r.description,
            status=r.status,
            regression_status=r.regression_status,
            signals_detected=r.signals_detected,
            affected_cases=r.affected_cases,
            reviewer_id=r.reviewer_id,
            decision=r.decision,
            decision_note=r.decision_note,
            model_before=r.model_before,
            model_after=r.model_after,
            test_count=r.test_count,
            passed_count=r.passed_count,
            failed_count=r.failed_count,
            created_at=r.created_at.isoformat() if r.created_at else None,
            reviewed_at=r.reviewed_at.isoformat() if r.reviewed_at else None,
        )
        for r in reviews
    ]


@router.post("/projects/{project_id}/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    project_id: int,
    review_data: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new review"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    review = service.create_review(
        project_id=project_id,
        title=review_data.title,
        description=review_data.description,
        replay_id=review_data.replay_id,
        signals_detected=review_data.signals_detected,
        model_before=review_data.model_before,
        model_after=review_data.model_after,
    )
    
    return ReviewResponse(
        id=review.id,
        project_id=review.project_id,
        replay_id=review.replay_id,
        title=review.title,
        description=review.description,
        status=review.status,
        regression_status=review.regression_status,
        signals_detected=review.signals_detected,
        affected_cases=review.affected_cases,
        reviewer_id=review.reviewer_id,
        decision=review.decision,
        decision_note=review.decision_note,
        model_before=review.model_before,
        model_after=review.model_after,
        test_count=review.test_count,
        passed_count=review.passed_count,
        failed_count=review.failed_count,
        created_at=review.created_at.isoformat() if review.created_at else None,
        reviewed_at=review.reviewed_at.isoformat() if review.reviewed_at else None,
    )


@router.get("/projects/{project_id}/reviews/{review_id}", response_model=ReviewResponse)
async def get_review(
    project_id: int,
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific review"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    review = service.get_review_by_id(review_id)
    
    if not review or review.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    
    return ReviewResponse(
        id=review.id,
        project_id=review.project_id,
        replay_id=review.replay_id,
        title=review.title,
        description=review.description,
        status=review.status,
        regression_status=review.regression_status,
        signals_detected=review.signals_detected,
        affected_cases=review.affected_cases,
        reviewer_id=review.reviewer_id,
        decision=review.decision,
        decision_note=review.decision_note,
        model_before=review.model_before,
        model_after=review.model_after,
        test_count=review.test_count,
        passed_count=review.passed_count,
        failed_count=review.failed_count,
        created_at=review.created_at.isoformat() if review.created_at else None,
        reviewed_at=review.reviewed_at.isoformat() if review.reviewed_at else None,
    )


@router.post("/projects/{project_id}/reviews/{review_id}/approve", response_model=ReviewResponse)
async def approve_review(
    project_id: int,
    review_id: int,
    decision: ReviewDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a review for deployment"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    review = service.approve_review(
        review_id=review_id,
        reviewer_id=current_user.id,
        decision_note=decision.decision_note,
    )
    
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    
    return ReviewResponse(
        id=review.id,
        project_id=review.project_id,
        replay_id=review.replay_id,
        title=review.title,
        description=review.description,
        status=review.status,
        regression_status=review.regression_status,
        signals_detected=review.signals_detected,
        affected_cases=review.affected_cases,
        reviewer_id=review.reviewer_id,
        decision=review.decision,
        decision_note=review.decision_note,
        model_before=review.model_before,
        model_after=review.model_after,
        test_count=review.test_count,
        passed_count=review.passed_count,
        failed_count=review.failed_count,
        created_at=review.created_at.isoformat() if review.created_at else None,
        reviewed_at=review.reviewed_at.isoformat() if review.reviewed_at else None,
    )


@router.post("/projects/{project_id}/reviews/{review_id}/reject", response_model=ReviewResponse)
async def reject_review(
    project_id: int,
    review_id: int,
    decision: ReviewDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a review (do not deploy)"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    review = service.reject_review(
        review_id=review_id,
        reviewer_id=current_user.id,
        decision_note=decision.decision_note,
    )
    
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    
    return ReviewResponse(
        id=review.id,
        project_id=review.project_id,
        replay_id=review.replay_id,
        title=review.title,
        description=review.description,
        status=review.status,
        regression_status=review.regression_status,
        signals_detected=review.signals_detected,
        affected_cases=review.affected_cases,
        reviewer_id=review.reviewer_id,
        decision=review.decision,
        decision_note=review.decision_note,
        model_before=review.model_before,
        model_after=review.model_after,
        test_count=review.test_count,
        passed_count=review.passed_count,
        failed_count=review.failed_count,
        created_at=review.created_at.isoformat() if review.created_at else None,
        reviewed_at=review.reviewed_at.isoformat() if review.reviewed_at else None,
    )


@router.post("/projects/{project_id}/reviews/{review_id}/discuss")
async def request_discussion(
    project_id: int,
    review_id: int,
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark review for discussion"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    review = service.request_discussion(
        review_id=review_id,
        reviewer_id=current_user.id,
        note=comment.content,
    )
    
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    
    return {"message": "Review marked for discussion", "status": review.status}


# Comments

@router.get("/projects/{project_id}/reviews/{review_id}/comments", response_model=List[CommentResponse])
async def list_comments(
    project_id: int,
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get comments for a review"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    comments = service.get_comments(review_id)
    
    return [
        CommentResponse(
            id=c.id,
            review_id=c.review_id,
            user_id=c.user_id,
            content=c.content,
            is_system=c.is_system,
            created_at=c.created_at.isoformat() if c.created_at else None,
        )
        for c in comments
    ]


@router.post("/projects/{project_id}/reviews/{review_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    project_id: int,
    review_id: int,
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a comment to a review"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    new_comment = service.add_comment(
        review_id=review_id,
        user_id=current_user.id,
        content=comment.content,
    )
    
    return CommentResponse(
        id=new_comment.id,
        review_id=new_comment.review_id,
        user_id=new_comment.user_id,
        content=new_comment.content,
        is_system=new_comment.is_system,
        created_at=new_comment.created_at.isoformat() if new_comment.created_at else None,
    )


# Cases

@router.get("/projects/{project_id}/reviews/{review_id}/cases", response_model=List[ReviewCaseResponse])
async def list_review_cases(
    project_id: int,
    review_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get test cases for a review"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    cases = service.get_review_cases(review_id, status=status)
    
    return [
        ReviewCaseResponse(
            id=c.id,
            review_id=c.review_id,
            snapshot_id=c.snapshot_id,
            prompt=c.prompt,
            response_before=c.response_before,
            response_after=c.response_after,
            signals=c.signals,
            status=c.status,
            manually_reviewed=c.manually_reviewed,
            manual_status=c.manual_status,
            reviewer_note=c.reviewer_note,
        )
        for c in cases
    ]


@router.patch("/projects/{project_id}/reviews/{review_id}/cases/{case_id}")
async def update_case_status(
    project_id: int,
    review_id: int,
    case_id: int,
    status: str,
    note: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a case's status (manual override)"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    case = service.update_case_status(case_id, status, note)
    
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found"
        )
    
    return {"message": "Case updated", "status": case.status}


# Stats

@router.get("/projects/{project_id}/reviews/stats", response_model=ReviewStatsResponse)
async def get_review_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get review statistics for a project"""
    project = check_project_access(project_id, current_user, db)
    
    service = ReviewService(db)
    stats = service.get_review_stats(project_id)
    
    return stats
