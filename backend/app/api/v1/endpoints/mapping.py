"""
Auto-Mapping endpoints for agent structure visualization
"""

from typing import Optional, Dict, Any
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
from app.services.mapping_service import MappingService


router = APIRouter()


class FilterRequest(BaseModel):
    """Filter request schema"""
    agent_name: Optional[str] = None
    min_score: Optional[float] = None
    max_latency: Optional[float] = None
    has_problems: Optional[bool] = None


@router.get("")
@handle_errors
async def get_mapping(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get agent structure mapping for a project
    
    Returns nodes and edges representing the agent structure.
    Pro plan required for full visualization.
    """
    logger.info(
        f"User {current_user.id} requested mapping for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Check feature access: auto_mapping requires Pro plan
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="auto_mapping",
        required_plan="pro",
        message="Auto-Mapping requires Pro plan or higher. Upgrade to visualize your agent structure."
    )

    # Get mapping structure
    structure = mapping_service.analyze_agent_structure(project_id, days)

    logger.info(
        f"Mapping retrieved: {structure['metadata']['total_nodes']} nodes, {structure['metadata']['total_edges']} edges",
        extra={"user_id": current_user.id, "project_id": project_id}
    )

    return success_response(data=structure)


@router.get("/graph")
@handle_errors
async def get_dependency_graph(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get dependency graph for a project
    
    Returns dependency graph based on chain_id relationships.
    Pro plan required.
    """
    logger.info(
        f"User {current_user.id} requested dependency graph for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "days": days}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Check feature access
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="auto_mapping",
        required_plan="pro",
        message="Dependency graph requires Pro plan or higher."
    )

    # Get dependency graph
    graph = mapping_service.build_dependency_graph(project_id, days)

    return success_response(data=graph)


@router.get("/nodes/{node_id}")
@handle_errors
async def get_node_details(
    project_id: int = Query(..., description="Project ID"),
    node_id: str = Path(..., description="Node ID (agent name)"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get detailed metrics for a specific node
    
    Pro plan required.
    """
    logger.info(
        f"User {current_user.id} requested node details for {node_id} in project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "node_id": node_id}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Check feature access
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="auto_mapping",
        required_plan="pro",
        message="Node details require Pro plan or higher."
    )

    # Get node metrics
    metrics = mapping_service.get_node_metrics(project_id, node_id, days)

    if "error" in metrics:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=metrics["error"]
        )

    return success_response(data=metrics)


@router.post("/filter")
@handle_errors
async def filter_mapping(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    filters: FilterRequest = FilterRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get filtered agent structure
    
    Pro plan required.
    """
    logger.info(
        f"User {current_user.id} requested filtered mapping for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "filters": filters.model_dump()}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Check feature access
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="auto_mapping",
        required_plan="pro",
        message="Filtered mapping requires Pro plan or higher."
    )

    # Convert Pydantic model to dict, removing None values
    filter_dict = {k: v for k, v in filters.model_dump().items() if v is not None}

    # Get filtered structure
    structure = mapping_service.filter_nodes(project_id, filter_dict, days)

    return success_response(data=structure)


@router.get("/subgraph")
@handle_errors
async def get_subgraph(
    project_id: int = Query(..., description="Project ID"),
    focus_node_id: str = Query(..., description="Node ID to focus on"),
    depth: int = Query(2, ge=1, le=5, description="Depth of neighbors to include"),
    days: int = Query(7, ge=1, le=90, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    mapping_service: MappingService = Depends(get_mapping_service),
):
    """
    Get subgraph focused on a specific node
    
    Useful for complex agent structures. Returns only nodes within specified depth.
    Pro plan required.
    """
    logger.info(
        f"User {current_user.id} requested subgraph for node {focus_node_id} in project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "focus_node_id": focus_node_id, "depth": depth}
    )

    # Verify project access
    check_project_access(project_id, current_user, db)

    # Check feature access
    check_feature_access(
        db=db,
        user_id=current_user.id,
        feature_name="auto_mapping",
        required_plan="pro",
        message="Subgraph view requires Pro plan or higher."
    )

    # Get subgraph
    subgraph = mapping_service.get_subgraph(project_id, focus_node_id, depth, days)

    return success_response(data=subgraph)
