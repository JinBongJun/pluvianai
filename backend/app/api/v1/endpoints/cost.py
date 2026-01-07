"""
Cost analysis endpoints
"""
from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
from app.services.cost_analyzer import CostAnalyzer

router = APIRouter()

cost_analyzer = CostAnalyzer()


class CostAnalysisResponse(BaseModel):
    """Cost analysis response schema"""
    total_cost: float
    by_model: dict
    by_provider: dict
    by_day: List[dict]
    average_daily_cost: float
    period_start: datetime
    period_end: datetime


class ModelComparisonResponse(BaseModel):
    """Model comparison response schema"""
    model: str
    provider: str
    model_name: str
    total_cost: float
    total_calls: int
    total_input_tokens: int
    total_output_tokens: int
    cost_per_call: float
    avg_latency: float


@router.get("/analysis", response_model=CostAnalysisResponse)
async def get_cost_analysis(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get cost analysis for a project"""
    # #region agent log
    import json
    try:
        with open('c:\\Users\\user\\Desktop\\AgentGuard\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"H1.3","location":"cost.py:45","message":"get_cost_analysis entry","data":{"project_id":project_id,"days":days,"user_id":current_user.id},"timestamp":int(__import__('time').time()*1000)})+'\n')
    except: pass
    # #endregion
    
    # Verify project access (any member can view cost)
    project = check_project_access(project_id, current_user, db)
    
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # #region agent log
    try:
        with open('c:\\Users\\user\\Desktop\\AgentGuard\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"H1.1","location":"cost.py:58","message":"Before analyze_project_costs","data":{"start_date":start_date.isoformat(),"end_date":end_date.isoformat()},"timestamp":int(__import__('time').time()*1000)})+'\n')
    except: pass
    # #endregion
    
    try:
        # Analyze costs
        analysis = cost_analyzer.analyze_project_costs(
            project_id=project_id,
            start_date=start_date,
            end_date=end_date,
            db=db
        )
        # #region agent log
        try:
            with open('c:\\Users\\user\\Desktop\\AgentGuard\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"H1.1","location":"cost.py:70","message":"After analyze_project_costs success","data":{"total_cost":analysis.total_cost if analysis else None},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        return analysis
    except Exception as e:
        # #region agent log
        try:
            with open('c:\\Users\\user\\Desktop\\AgentGuard\\.cursor\\debug.log', 'a', encoding='utf-8') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"H1.1","location":"cost.py:75","message":"analyze_project_costs error","data":{"error_type":type(e).__name__,"error_message":str(e)},"timestamp":int(__import__('time').time()*1000)})+'\n')
        except: pass
        # #endregion
        # Return empty analysis on error instead of raising exception
        from app.core.logging_config import logger
        logger.error(f"Error analyzing costs for project {project_id}: {str(e)}")
        return CostAnalysisResponse(
            total_cost=0.0,
            by_model={},
            by_provider={},
            by_day=[],
            average_daily_cost=0.0,
            period_start=start_date,
            period_end=end_date
        )


@router.post("/detect-anomalies")
async def detect_cost_anomalies(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Detect cost anomalies for a project"""
    # Verify project access (any member can view cost)
    project = check_project_access(project_id, current_user, db)
    
    # Detect anomalies
    alerts = cost_analyzer.detect_cost_anomalies(
        project_id=project_id,
        db=db
    )
    
    return {"alerts_created": len(alerts), "alerts": alerts}


@router.get("/compare-models", response_model=List[ModelComparisonResponse])
async def compare_models(
    project_id: int = Query(..., description="Project ID"),
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Compare costs across different models"""
    # Verify project access (any member can view cost)
    project = check_project_access(project_id, current_user, db)
    
    # Compare models
    comparisons = cost_analyzer.compare_models(
        project_id=project_id,
        days=days,
        db=db
    )
    
    return comparisons



