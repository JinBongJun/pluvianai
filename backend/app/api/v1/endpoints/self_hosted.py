from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from app.core.database import get_db
from app.models.project import Project
from app.models.user import User
from app.core.dependencies import get_current_user
from pydantic import BaseModel

router = APIRouter()

class SentinelReport(BaseModel):
    trace_id: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    timestamp: str

@router.post("/projects/{project_id}/sentinel/report")
async def report_sentinel_data(
    project_id: int,
    report: SentinelReport,
    x_api_key: str = Header(...),
    db: Session = Depends(get_db)
):
    """
    Receives deterministic mapping data and flags structural drift (Ghost Nodes).
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Official Blueprint from Laboratory
    blueprint_nodes = project.canvas_nodes or []
    blueprint_node_ids = {n.get("id") for n in blueprint_nodes if n.get("id")}
    
    # Drift Detection Logic
    analyzed_nodes = []
    has_drift = False
    
    for node in report.nodes:
        node_id = node.get("id")
        is_ghost = node_id not in blueprint_node_ids
        
        # Enrich node data with drift status
        node["drift_status"] = "ghost" if is_ghost else "official"
        if is_ghost:
            has_drift = True
        
        analyzed_nodes.append(node)
    
    # Update report with enrichment
    report.nodes = analyzed_nodes
    
    # Store the summarized drift state in Cache for Live View
    from app.services.cache_service import cache_service
    if cache_service.enabled:
        report_key = f"project:{project_id}:sentinel:latest"
        report_data = report.dict()
        report_data["has_drift"] = has_drift
        
        cache_service.redis_client.set(report_key, json.dumps(report_data))
        cache_service.redis_client.expire(report_key, 3600)
    
    return {
        "status": "success", 
        "ghost_nodes_detected": has_drift,
        "nodes_received": len(report.nodes)
    }

@router.get("/projects/{project_id}/sentinel/status")
async def get_sentinel_status(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if the Sentinel is online for this project"""
    from app.services.cache_service import cache_service
    is_online = False
    if cache_service.enabled:
        is_online = cache_service.redis_client.exists(f"project:{project_id}:sentinel:latest")
    
    return {"project_id": project_id, "sentinel_online": bool(is_online)}
