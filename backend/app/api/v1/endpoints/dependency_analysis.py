"""
Dependency Analysis endpoints for analyzing agent dependencies
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.feature_access import check_feature_access
from app.core.responses import success_response
from app.core.dependencies import get_mapping_service
from app.core.logging_config import logger
from app.models.user import User
from app.services.dependency_analysis_service import DependencyAnalysisService
from app.services.mapping_service import MappingService


router = APIRouter()


@router.post("")
@handle_errors
async def analyze_dependencies(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze agent dependencies
    
    Free plan: Returns text summary only.
    Pro plan: Returns full analysis with mapping visualization.
    """
    logger.info(
        f"User {current_user.id} requested dependency analysis for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Create service
    service = DependencyAnalysisService(db)

    # Analyze dependencies
    analysis = service.analyze_dependencies(project_id, days)

    # Check if user has Pro plan for full mapping data
    try:
        check_feature_access(
            db=db,
            user_id=current_user.id,
            feature_name="auto_mapping",
            required_plan="pro",
            message="Full dependency analysis with mapping visualization requires Pro plan."
        )
        # Pro plan: include full mapping data
        analysis["mapping_available"] = True
    except Exception:
        # Free plan: text summary only
        analysis["mapping_available"] = False
        # Remove detailed mapping data for free users
        if "dependency_graph" in analysis:
            del analysis["dependency_graph"]

    logger.info(
        f"Dependency analysis completed: {analysis['metadata']['total_nodes']} nodes",
        extra={"user_id": current_user.id, "project_id": project_id}
    )

    return success_response(data=analysis)


@router.get("/{analysis_id}")
@handle_errors
async def get_dependency_analysis(
    project_id: int = Query(..., description="Project ID"),
    analysis_id: str = Query(..., description="Analysis ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get dependency analysis results
    
    For MVP, re-runs analysis. In production, would retrieve from DB.
    """
    logger.info(
        f"User {current_user.id} requested dependency analysis {analysis_id} for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "analysis_id": analysis_id}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Re-run analysis (in production, retrieve from DB)
    service = DependencyAnalysisService(db)
    analysis = service.analyze_dependencies(project_id)

    return success_response(data=analysis)


@router.get("/{analysis_id}/mapping")
@handle_errors
async def get_dependency_analysis_mapping(
    project_id: int = Query(..., description="Project ID"),
    analysis_id: str = Query(..., description="Analysis ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get mapping data for dependency analysis (Pro plan only)
    
    Returns mapping structure with dependency information.
    """
    logger.info(
        f"User {current_user.id} requested dependency analysis mapping for project {project_id}",
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
        message="Dependency analysis mapping requires Pro plan or higher."
    )

    # Get dependency analysis
    service = DependencyAnalysisService(db)
    analysis = service.analyze_dependencies(project_id)

    # Get mapping structure
    structure = mapping_service.analyze_agent_structure(project_id)

    # Enrich nodes with dependency information
    dependency_map = analysis.get("dependency_map", {})
    dependents_map = analysis.get("dependents_map", {})
    node_depths = analysis.get("node_depths", {})

    for node in structure["nodes"]:
        node_id = node["id"]
        node["dependencies"] = dependency_map.get(node_id, [])
        node["dependents"] = dependents_map.get(node_id, [])
        node["depth"] = node_depths.get(node_id, 0)

    return success_response(data={
        "structure": structure,
        "dependency_analysis": analysis,
    })
