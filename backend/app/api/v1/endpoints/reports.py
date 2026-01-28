"""
Reports endpoints
"""

from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.core.decorators import handle_errors
from app.core.logging_config import logger
from app.core.responses import success_response
from app.models.user import User
from app.models.api_call import APICall
from app.models.quality_score import QualityScore
from app.models.alert import Alert
from app.services.cost_analyzer import CostAnalyzer
import json
import io

router = APIRouter()
cost_analyzer = CostAnalyzer()


class GenerateReportRequest(BaseModel):
    """Generate report request"""
    template: Optional[str] = "standard"  # standard, detailed, summary
    format: Optional[str] = "json"  # json, pdf
    days: Optional[int] = 30
    include_charts: Optional[bool] = True


@router.post("/generate")
@handle_errors
async def generate_report(
    request: GenerateReportRequest,
    project_id: int = Query(..., description="Project ID", gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a report for a project
    """
    logger.info(
        f"User {current_user.id} requested report generation for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id, "template": request.template, "format": request.format}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=request.days or 30)

    # Gather report data
    api_calls = (
        db.query(APICall)
        .filter(
            APICall.project_id == project_id,
            APICall.created_at >= period_start,
            APICall.created_at <= period_end,
        )
        .all()
    )

    quality_scores = (
        db.query(QualityScore)
        .filter(
            QualityScore.project_id == project_id,
            QualityScore.created_at >= period_start,
            QualityScore.created_at <= period_end,
        )
        .all()
    )

    alerts = (
        db.query(Alert)
        .filter(
            Alert.project_id == project_id,
            Alert.created_at >= period_start,
            Alert.created_at <= period_end,
        )
        .all()
    )

    # Calculate statistics
    total_calls = len(api_calls)
    successful_calls = sum(1 for call in api_calls if call.status_code and 200 <= call.status_code < 300)
    success_rate = (successful_calls / total_calls) if total_calls > 0 else 0.0

    # Cost analysis
    cost_analysis = cost_analyzer.analyze_project_costs(
        project_id=project_id,
        start_date=period_start,
        end_date=period_end,
        db=db,
    )

    # Quality statistics
    avg_quality = 0.0
    if quality_scores:
        avg_quality = sum(score.overall_score for score in quality_scores) / len(quality_scores)

    # Build report
    report = {
        "project_id": project_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "generated_at": datetime.utcnow().isoformat(),
        "summary": {
            "total_calls": total_calls,
            "successful_calls": successful_calls,
            "failed_calls": total_calls - successful_calls,
            "success_rate": success_rate,
            "total_cost": cost_analysis.get("total_cost", 0.0),
            "average_quality_score": avg_quality,
            "total_alerts": len(alerts),
        },
        "cost_analysis": cost_analysis,
        "quality_scores": {
            "total_evaluations": len(quality_scores),
            "average_score": avg_quality,
        },
        "alerts": {
            "total": len(alerts),
            "by_severity": {},
        },
    }

    # Count alerts by severity
    for alert in alerts:
        severity = alert.severity
        report["alerts"]["by_severity"][severity] = report["alerts"]["by_severity"].get(severity, 0) + 1

    logger.info(
        f"Report generated for project {project_id}",
        extra={"user_id": current_user.id, "project_id": project_id}
    )

    return success_response(data=report)


@router.get("/download")
@handle_errors
async def download_report(
    project_id: int = Query(..., description="Project ID", gt=0),
    template: str = Query("standard", description="Report template"),
    format: str = Query("json", description="Report format (json or pdf)"),
    days: int = Query(30, ge=1, le=90, description="Number of days"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Download a report as a file
    """
    logger.info(
        f"User {current_user.id} requested report download for project {project_id} (format: {format})",
        extra={"user_id": current_user.id, "project_id": project_id, "format": format, "template": template}
    )
    
    # Verify project access
    check_project_access(project_id, current_user, db)

    # Calculate date range
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)

    # Gather report data
    api_calls = (
        db.query(APICall)
        .filter(
            APICall.project_id == project_id,
            APICall.created_at >= period_start,
            APICall.created_at <= period_end,
        )
        .all()
    )

    quality_scores = (
        db.query(QualityScore)
        .filter(
            QualityScore.project_id == project_id,
            QualityScore.created_at >= period_start,
            QualityScore.created_at <= period_end,
        )
        .all()
    )

    alerts = (
        db.query(Alert)
        .filter(
            Alert.project_id == project_id,
            Alert.created_at >= period_start,
            Alert.created_at <= period_end,
        )
        .all()
    )

    # Calculate statistics
    total_calls = len(api_calls)
    successful_calls = sum(1 for call in api_calls if call.status_code and 200 <= call.status_code < 300)
    success_rate = (successful_calls / total_calls) if total_calls > 0 else 0.0

    # Cost analysis
    cost_analysis = cost_analyzer.analyze_project_costs(
        project_id=project_id,
        start_date=period_start,
        end_date=period_end,
        db=db,
    )

    # Quality statistics
    avg_quality = 0.0
    if quality_scores:
        avg_quality = sum(score.overall_score for score in quality_scores) / len(quality_scores)

    # Build report
    report_dict = {
        "project_id": project_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "generated_at": datetime.utcnow().isoformat(),
        "summary": {
            "total_calls": total_calls,
            "successful_calls": successful_calls,
            "failed_calls": total_calls - successful_calls,
            "success_rate": success_rate,
            "total_cost": cost_analysis.get("total_cost", 0.0),
            "average_quality_score": avg_quality,
            "total_alerts": len(alerts),
        },
        "cost_analysis": cost_analysis,
        "quality_scores": {
            "total_evaluations": len(quality_scores),
            "average_score": avg_quality,
        },
        "alerts": {
            "total": len(alerts),
            "by_severity": {},
        },
    }

    # Count alerts by severity
    for alert in alerts:
        severity = alert.severity
        report_dict["alerts"]["by_severity"][severity] = report_dict["alerts"]["by_severity"].get(severity, 0) + 1

    # Format based on requested format
    if format == "pdf":
        # For PDF, return JSON for now (PDF generation can be added later)
        # In production, use a library like reportlab or weasyprint
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="PDF format not yet implemented. Please use JSON format."
        )
    else:
        # JSON format
        json_content = json.dumps(report_dict, indent=2, default=str)
        filename = f"report-project-{project_id}-{datetime.utcnow().strftime('%Y%m%d')}.json"
        
        return StreamingResponse(
            io.BytesIO(json_content.encode()),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
