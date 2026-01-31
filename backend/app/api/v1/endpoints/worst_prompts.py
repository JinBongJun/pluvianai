"""
Worst Prompts API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access, ProjectRole
from app.models.user import User
from app.services.worst_prompt_service import WorstPromptService

router = APIRouter()


# Request/Response Models

class WorstPromptResponse(BaseModel):
    id: int
    project_id: int
    snapshot_id: Optional[int]
    prompt_text: str
    reason: str
    severity_score: float
    model: Optional[str]
    provider: Optional[str]
    is_active: bool
    is_reviewed: bool
    cluster_id: Optional[str]
    created_at: Optional[str]

    class Config:
        from_attributes = True


class WorstPromptCreate(BaseModel):
    prompt_text: str = Field(..., description="The prompt text")
    reason: str = Field(..., description="Why this prompt is flagged")
    severity_score: float = Field(0.5, ge=0.0, le=1.0)
    model: Optional[str] = None
    provider: Optional[str] = None
    context: Optional[dict] = None
    original_response: Optional[str] = None


class WorstPromptUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_reviewed: Optional[bool] = None
    severity_score: Optional[float] = Field(None, ge=0.0, le=1.0)


class PromptSetCreate(BaseModel):
    name: str = Field(..., description="Set name")
    description: Optional[str] = None
    auto_collect: bool = True
    max_prompts: int = Field(100, ge=1, le=1000)
    collection_criteria: Optional[dict] = None


class PromptSetResponse(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str]
    auto_collect: bool
    max_prompts: int
    prompt_count: int
    collection_criteria: Optional[dict]

    class Config:
        from_attributes = True


class WorstPromptStatsResponse(BaseModel):
    total: int
    active: int
    reviewed: int
    unreviewed: int
    by_reason: dict
    avg_severity: float


# Endpoints

@router.get("/projects/{project_id}/worst-prompts", response_model=List[WorstPromptResponse])
async def list_worst_prompts(
    project_id: int,
    reason: Optional[str] = None,
    is_active: Optional[bool] = True,
    is_reviewed: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get worst prompts for a project"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    prompts = service.get_worst_prompts(
        project_id=project_id,
        reason=reason,
        is_active=is_active,
        is_reviewed=is_reviewed,
        limit=limit,
        offset=offset,
    )
    
    return [
        WorstPromptResponse(
            id=p.id,
            project_id=p.project_id,
            snapshot_id=p.snapshot_id,
            prompt_text=p.prompt_text,
            reason=p.reason,
            severity_score=p.severity_score,
            model=p.model,
            provider=p.provider,
            is_active=p.is_active,
            is_reviewed=p.is_reviewed,
            cluster_id=p.cluster_id,
            created_at=p.created_at.isoformat() if p.created_at else None,
        )
        for p in prompts
    ]


@router.post("/projects/{project_id}/worst-prompts", response_model=WorstPromptResponse, status_code=status.HTTP_201_CREATED)
async def create_worst_prompt(
    project_id: int,
    prompt_data: WorstPromptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually add a worst prompt"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    prompt = service.auto_collect_worst_prompt(
        project_id=project_id,
        snapshot_id=None,
        prompt_text=prompt_data.prompt_text,
        reason=prompt_data.reason,
        severity_score=prompt_data.severity_score,
        model=prompt_data.model,
        provider=prompt_data.provider,
        context=prompt_data.context,
        response_text=prompt_data.original_response,
    )
    
    return WorstPromptResponse(
        id=prompt.id,
        project_id=prompt.project_id,
        snapshot_id=prompt.snapshot_id,
        prompt_text=prompt.prompt_text,
        reason=prompt.reason,
        severity_score=prompt.severity_score,
        model=prompt.model,
        provider=prompt.provider,
        is_active=prompt.is_active,
        is_reviewed=prompt.is_reviewed,
        cluster_id=prompt.cluster_id,
        created_at=prompt.created_at.isoformat() if prompt.created_at else None,
    )


@router.get("/projects/{project_id}/worst-prompts/{prompt_id}", response_model=WorstPromptResponse)
async def get_worst_prompt(
    project_id: int,
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific worst prompt"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    prompt = service.get_worst_prompt_by_id(prompt_id)
    
    if not prompt or prompt.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worst prompt not found"
        )
    
    return WorstPromptResponse(
        id=prompt.id,
        project_id=prompt.project_id,
        snapshot_id=prompt.snapshot_id,
        prompt_text=prompt.prompt_text,
        reason=prompt.reason,
        severity_score=prompt.severity_score,
        model=prompt.model,
        provider=prompt.provider,
        is_active=prompt.is_active,
        is_reviewed=prompt.is_reviewed,
        cluster_id=prompt.cluster_id,
        created_at=prompt.created_at.isoformat() if prompt.created_at else None,
    )


@router.patch("/projects/{project_id}/worst-prompts/{prompt_id}", response_model=WorstPromptResponse)
async def update_worst_prompt(
    project_id: int,
    prompt_id: int,
    update_data: WorstPromptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a worst prompt"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    prompt = service.update_worst_prompt(
        prompt_id,
        **update_data.model_dump(exclude_unset=True)
    )
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worst prompt not found"
        )
    
    return WorstPromptResponse(
        id=prompt.id,
        project_id=prompt.project_id,
        snapshot_id=prompt.snapshot_id,
        prompt_text=prompt.prompt_text,
        reason=prompt.reason,
        severity_score=prompt.severity_score,
        model=prompt.model,
        provider=prompt.provider,
        is_active=prompt.is_active,
        is_reviewed=prompt.is_reviewed,
        cluster_id=prompt.cluster_id,
        created_at=prompt.created_at.isoformat() if prompt.created_at else None,
    )


@router.post("/projects/{project_id}/worst-prompts/{prompt_id}/review")
async def mark_as_reviewed(
    project_id: int,
    prompt_id: int,
    keep_active: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a worst prompt as reviewed"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    prompt = service.mark_as_reviewed(prompt_id, is_active=keep_active)
    
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worst prompt not found"
        )
    
    return {"message": "Marked as reviewed", "is_active": keep_active}


@router.delete("/projects/{project_id}/worst-prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_worst_prompt(
    project_id: int,
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a worst prompt"""
    project = check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER])
    
    service = WorstPromptService(db)
    success = service.delete_worst_prompt(prompt_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worst prompt not found"
        )


@router.get("/projects/{project_id}/worst-prompts/stats", response_model=WorstPromptStatsResponse)
async def get_worst_prompt_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get statistics for worst prompts"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    stats = service.get_worst_prompt_stats(project_id)
    
    return stats


# Prompt Sets

@router.get("/projects/{project_id}/worst-prompt-sets", response_model=List[PromptSetResponse])
async def list_prompt_sets(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all prompt sets for a project"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    sets = service.get_prompt_sets(project_id)
    
    return sets


@router.post("/projects/{project_id}/worst-prompt-sets", response_model=PromptSetResponse, status_code=status.HTTP_201_CREATED)
async def create_prompt_set(
    project_id: int,
    set_data: PromptSetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new prompt set"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    prompt_set = service.create_prompt_set(
        project_id=project_id,
        name=set_data.name,
        description=set_data.description,
        auto_collect=set_data.auto_collect,
        max_prompts=set_data.max_prompts,
        collection_criteria=set_data.collection_criteria,
    )
    
    return prompt_set


@router.get("/projects/{project_id}/worst-prompt-sets/{set_id}/prompts", response_model=List[WorstPromptResponse])
async def get_prompts_in_set(
    project_id: int,
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all prompts in a set"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    prompts = service.get_prompts_in_set(set_id)
    
    return [
        WorstPromptResponse(
            id=p.id,
            project_id=p.project_id,
            snapshot_id=p.snapshot_id,
            prompt_text=p.prompt_text,
            reason=p.reason,
            severity_score=p.severity_score,
            model=p.model,
            provider=p.provider,
            is_active=p.is_active,
            is_reviewed=p.is_reviewed,
            cluster_id=p.cluster_id,
            created_at=p.created_at.isoformat() if p.created_at else None,
        )
        for p in prompts
    ]


@router.post("/projects/{project_id}/worst-prompt-sets/{set_id}/prompts/{prompt_id}")
async def add_prompt_to_set(
    project_id: int,
    set_id: int,
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a prompt to a set"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    member = service.add_prompt_to_set(set_id, prompt_id)
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt set not found"
        )
    
    return {"message": "Prompt added to set"}


@router.delete("/projects/{project_id}/worst-prompt-sets/{set_id}/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_prompt_from_set(
    project_id: int,
    set_id: int,
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a prompt from a set"""
    project = check_project_access(project_id, current_user, db)
    
    service = WorstPromptService(db)
    success = service.remove_prompt_from_set(set_id, prompt_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found in set"
        )
