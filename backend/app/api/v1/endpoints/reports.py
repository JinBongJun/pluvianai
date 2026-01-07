"""
Report generation endpoints
"""
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.models.drift_detection import DriftDetection
import json
import io

router = APIRouter()


class ReportRequest(BaseModel):
    """Report generation request"""
    project_id: int
    template: str = "standard"  # standard, detailed, executive
    format: str = "json"  # json, pdf (PDF requires additional library)
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


@router.post("/generate")
async def generate_report(
    project_id: int = Query(..., description="Project ID"),
    template: str = Query("standard", description="Report template"),
    date_from: Optional[str] = Query(None, description="Start date (ISO format)"),
    date_to: Optional[str] = Query(None, description="End date (ISO format)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate a report for a project"""
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    # Parse dates
    start_date = None
    end_date = None
    if date_from:
        start_date = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
    if date_to:
        end_date = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        end_date = end_date.replace(hour=23, minute=59, second=59)
    
    # Get statistics
    api_calls_query = db.query(APICall).filter(APICall.project_id == project_id)
    
    if start_date:
        api_calls_query = api_calls_query.filter(APICall.created_at >= start_date)
    if end_date:
        api_calls_query = api_calls_query.filter(APICall.created_at <= end_date)
    
    total_calls = api_calls_query.count()
    successful_calls = api_calls_query.filter(
        and_(APICall.status_code >= 200, APICall.status_code < 300)
    ).count()
    
    # Get quality statistics
    quality_query = db.query(
        func.avg(QualityScore.overall_score).label('avg_score'),
        func.min(QualityScore.overall_score).label('min_score'),
        func.max(QualityScore.overall_score).label('max_score'),
        func.count(QualityScore.id).label('count')
    ).join(APICall).filter(APICall.project_id == project_id)
    
    if start_date:
        quality_query = quality_query.filter(APICall.created_at >= start_date)
    if end_date:
        quality_query = quality_query.filter(APICall.created_at <= end_date)
    
    quality_scores = quality_query.first()
    
    # Get drift detections
    drift_query = db.query(DriftDetection).filter(
        DriftDetection.project_id == project_id
    )
    if start_date:
        drift_query = drift_query.filter(DriftDetection.detected_at >= start_date)
    if end_date:
        drift_query = drift_query.filter(DriftDetection.detected_at <= end_date)
    
    drift_count = drift_query.count()
    high_severity_drifts = drift_query.filter(
        DriftDetection.severity.in_(['high', 'critical'])
    ).count()
    
    # Calculate costs (simplified)
    api_calls = api_calls_query.all()
    total_cost = sum(
        (call.request_tokens or 0) * 0.00003 / 1000 + (call.response_tokens or 0) * 0.00006 / 1000
        for call in api_calls
    )
    
    # Build report
    report = {
        "project_id": project_id,
        "project_name": project.name,
        "generated_at": datetime.utcnow().isoformat(),
        "period": {
            "from": start_date.isoformat() if start_date else None,
            "to": end_date.isoformat() if end_date else None,
        },
        "summary": {
            "total_api_calls": total_calls,
            "successful_calls": successful_calls,
            "failed_calls": total_calls - successful_calls,
            "success_rate": (successful_calls / total_calls * 100) if total_calls > 0 else 0,
            "total_cost": round(total_cost, 2),
            "quality_scores": {
                "average": float(quality_scores.avg_score) if quality_scores.avg_score else None,
                "min": float(quality_scores.min_score) if quality_scores.min_score else None,
                "max": float(quality_scores.max_score) if quality_scores.max_score else None,
                "total_evaluations": int(quality_scores.count) if quality_scores.count else 0,
            },
            "drift_detections": {
                "total": drift_count,
                "high_severity": high_severity_drifts,
            },
        },
        "template": template,
    }
    
    # Add detailed data for detailed template
    if template == "detailed":
        report["details"] = {
            "top_models": [],
            "error_breakdown": {},
            "cost_by_model": {},
        }
    
    return report


@router.get("/download")
async def download_report(
    project_id: int = Query(..., description="Project ID"),
    template: str = Query("standard", description="Report template"),
    format: str = Query("json", description="Report format"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download report as file"""
    # Generate report
    report_data = await generate_report(
        project_id=project_id,
        template=template,
        date_from=date_from,
        date_to=date_to,
        current_user=current_user,
        db=db
    )
    
    if format == "json":
        # Return as JSON file
        json_str = json.dumps(report_data, indent=2)
        return Response(
            content=json_str,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=report-{project_id}-{datetime.now().strftime('%Y%m%d')}.json"
            }
        )
    else:
        # PDF generation would require additional library like reportlab or weasyprint
        # For now, return JSON
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="PDF format not yet implemented"
        )

