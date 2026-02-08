from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.services.cost_analyzer import CostAnalyzer

router = APIRouter()

@router.get("/analysis")
def get_cost_analysis(
    project_id: int,
    timeframe: str = Query("30d", pattern="^(7d|30d|90d)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get cost analysis for a project over a specific timeframe."""
    check_project_access(project_id, current_user, db)
    
    period_days = 30
    if timeframe == "7d":
        period_days = 7
    elif timeframe == "30d":
        period_days = 30
    elif timeframe == "90d":
        period_days = 90
        
    analyzer = CostAnalyzer()
    analysis = analyzer.analyze_project_costs(
        project_id=project_id,
        period_days=period_days,
        db=db
    )
    
    return analysis
