"""
Performance Analysis endpoints for identifying performance bottlenecks
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status
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
from app.services.performance_analysis_service import PerformanceAnalysisService
from app.services.mapping_service import MappingService


router = APIRouter()


@router.post("")
@handle_errors
async def analyze_performance(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    percentile_threshold: float = Query(0.95, ge=0.0, le=1.0, description="Percentile threshold for bottlenecks"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze performance bottlenecks
    
    Identifies nodes with high latency.
    Free plan: Returns text summary only.
    Pro plan: Returns full analysis with mapping visualization.
    """
    logger.info(
        f"User {current_user.id} requested performance analysis for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Create service
    service = PerformanceAnalysisService(db)

    # Analyze performance
    analysis = service.analyze_performance(project_id, days, percentile_threshold)

    # Check if user has Pro plan for full mapping data
    try:
        check_feature_access(
            db=db,
            user_id=current_user.id,
            feature_name="auto_mapping",
            required_plan="pro",
            message="Full performance analysis with mapping visualization requires Pro plan."
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
        f"Performance analysis completed: {analysis.get('bottleneck_count', 0)} bottlenecks found",
        extra={"user_id": current_user.id, "project_id": project_id, "bottleneck_count": analysis.get("bottleneck_count", 0)}
    )

    return success_response(data=analysis)


@router.get("/{analysis_id}")
@handle_errors
async def get_performance_analysis(
    project_id: int = Query(..., description="Project ID"),
    analysis_id: str = Path(..., description="Analysis ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get performance analysis results
    
    For MVP, re-runs analysis. In production, would retrieve from DB.
    """
    logger.info(
        f"User {current_user.id} requested performance analysis {analysis_id} for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "analysis_id": analysis_id}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Re-run analysis (in production, retrieve from DB)
    service = PerformanceAnalysisService(db)
    analysis = service.analyze_performance(project_id)

    return success_response(data=analysis)


@router.get("/{analysis_id}/mapping")
@handle_errors
async def get_performance_analysis_mapping(
    project_id: int = Query(..., description="Project ID"),
    analysis_id: str = Path(..., description="Analysis ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get mapping data for performance analysis (Pro plan only)
    
    Returns mapping structure with bottleneck nodes highlighted.
    """
    logger.info(
        f"User {current_user.id} requested performance analysis mapping for project {project_id}",
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
        message="Performance analysis mapping requires Pro plan or higher."
    )

    # Get performance analysis
    service = PerformanceAnalysisService(db)
    analysis = service.analyze_performance(project_id)

    # Get mapping structure
    structure = mapping_service.analyze_agent_structure(project_id)
    if not structure:
        structure = {"nodes": []}

    # Mark bottleneck nodes
    bottleneck_nodes = analysis.get("bottleneck_nodes", [])
    bottleneck_node_ids = {node.get("id") for node in bottleneck_nodes if node.get("id")}
    nodes = structure.get("nodes", [])
    for node in nodes:
        if node.get("id") in bottleneck_node_ids:
            node["is_bottleneck"] = True
            bottleneck_node = next(
                (n for n in bottleneck_nodes if n.get("id") == node.get("id")),
                None
            )
            if bottleneck_node:
                node["bottleneck_severity"] = bottleneck_node.get("severity")
                node["latency_stats"] = bottleneck_node.get("latency_stats", {})

    # Update structure with enriched nodes
    structure["nodes"] = nodes

    return success_response(data={
        "structure": structure,
        "bottleneck_nodes": bottleneck_nodes,
        "global_stats": analysis.get("global_stats", {}),
    })
