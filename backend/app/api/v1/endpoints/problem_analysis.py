"""
Problem Analysis endpoints for identifying problem nodes
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.feature_access import check_feature_access
from app.core.responses import success_response
from app.core.dependencies import get_mapping_service
from app.core.logging_config import logger
from app.models.user import User
from app.services.problem_analysis_service import ProblemAnalysisService
from app.services.mapping_service import MappingService


router = APIRouter()


class ProblemAnalysisResponse(BaseModel):
    """Problem analysis response schema"""
    project_id: int
    analysis_date: str
    total_nodes: int
    problem_nodes: list
    problem_count: int
    metadata: dict


@router.post("")
@handle_errors
async def analyze_problems(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    threshold_score: float = Query(3.0, ge=0.0, le=5.0, description="Score threshold for problems"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze problems in agent structure
    
    Identifies nodes with low scores or high error rates.
    Free plan: Returns text summary only.
    Pro plan: Returns full analysis with mapping data.
    """
    logger.info(
        f"User {current_user.id} requested problem analysis for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Create service
    service = ProblemAnalysisService(db)

    # Analyze problems
    analysis = service.analyze_problems(project_id, days, threshold_score)

    # Check if user has Pro plan for full mapping data
    try:
        check_feature_access(
            db=db,
            user_id=current_user.id,
            feature_name="auto_mapping",
            required_plan="pro",
            message="Full problem analysis with mapping visualization requires Pro plan."
        )
        # Pro plan: include full mapping data
        analysis["mapping_available"] = True
    except Exception:
        # Free plan: text summary only
        analysis["mapping_available"] = False
        # Remove detailed mapping data for free users
        if "metadata" in analysis and isinstance(analysis["metadata"], dict) and "structure" in analysis["metadata"]:
            del analysis["metadata"]["structure"]

    logger.info(
        f"Problem analysis completed: {analysis.get('problem_count', 0)} problems found",
        extra={"user_id": current_user.id, "project_id": project_id, "problem_count": analysis.get("problem_count", 0)}
    )

    return success_response(data=analysis)


@router.get("/{analysis_id}")
@handle_errors
async def get_problem_analysis(
    project_id: int = Query(..., description="Project ID"),
    analysis_id: str = Path(..., description="Analysis ID (timestamp)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get problem analysis results
    
    For MVP, we'll use timestamp as analysis_id.
    In production, this would be stored in a database.
    """
    logger.info(
        f"User {current_user.id} requested problem analysis {analysis_id} for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "analysis_id": analysis_id}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # For MVP, re-run analysis (in production, retrieve from DB)
    service = ProblemAnalysisService(db)
    analysis = service.analyze_problems(project_id)

    return success_response(data=analysis)


@router.get("/{analysis_id}/mapping")
@handle_errors
async def get_problem_analysis_mapping(
    project_id: int = Query(..., description="Project ID"),
    analysis_id: str = Path(..., description="Analysis ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get mapping data for problem analysis (Pro plan only)
    
    Returns mapping structure with problem nodes highlighted.
    """
    logger.info(
        f"User {current_user.id} requested problem analysis mapping for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "analysis_id": analysis_id}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Check feature access: Pro plan required
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="auto_mapping",
        required_plan="pro",
        message="Problem analysis mapping requires Pro plan or higher."
    )

    # Get problem nodes
    service = ProblemAnalysisService(db)
    problem_nodes = service.get_problem_nodes(project_id)

    # Get mapping structure
    structure = mapping_service.analyze_agent_structure(project_id)

    # Mark problem nodes
    problem_node_ids = {node["id"] for node in problem_nodes}
    for node in structure["nodes"]:
        if node["id"] in problem_node_ids:
            node["is_problem"] = True
            node["problem_severity"] = next(
                (n["severity"] for n in problem_nodes if n["id"] == node["id"]),
                0.5
            )

    return success_response(data={
        "structure": structure,
        "problem_nodes": problem_nodes,
    })
