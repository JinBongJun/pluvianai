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
    
    # Calculate costs using CostAnalyzer
    from app.services.cost_analyzer import CostAnalyzer
    cost_analyzer = CostAnalyzer()
    api_calls = api_calls_query.all()
    total_cost = sum(
        cost_analyzer.calculate_cost(
            call.provider,
            call.model,
            call.request_tokens or 0,
            call.response_tokens or 0
        )
        for call in api_calls
    )
    
    # Build base report structure
    base_report = {
        "project_id": project_id,
        "project_name": project.name,
        "generated_at": datetime.utcnow().isoformat(),
        "period": {
            "from": start_date.isoformat() if start_date else None,
            "to": end_date.isoformat() if end_date else None,
        },
        "template": template,
    }
    
    # Template-specific report generation
    if template == "standard":
        # Standard Report: Basic summary with key metrics
        report = {
            **base_report,
            "type": "standard",
            "summary": {
                "total_api_calls": total_calls,
                "successful_calls": successful_calls,
                "failed_calls": total_calls - successful_calls,
                "success_rate": round((successful_calls / total_calls * 100) if total_calls > 0 else 0, 2),
                "total_cost": round(total_cost, 2),
                "quality_scores": {
                    "average": round(float(quality_scores.avg_score), 2) if quality_scores.avg_score else None,
                    "min": round(float(quality_scores.min_score), 2) if quality_scores.min_score else None,
                    "max": round(float(quality_scores.max_score), 2) if quality_scores.max_score else None,
                    "total_evaluations": int(quality_scores.count) if quality_scores.count else 0,
                },
                "drift_detections": {
                    "total": drift_count,
                    "high_severity": high_severity_drifts,
                },
            },
        }
    
    elif template == "detailed":
        # Detailed Report: Comprehensive analysis with breakdowns
        # Get model statistics
        model_stats = db.query(
            APICall.provider,
            APICall.model,
            func.count(APICall.id).label('call_count'),
            func.sum(APICall.request_tokens).label('total_input_tokens'),
            func.sum(APICall.response_tokens).label('total_output_tokens'),
            func.avg(APICall.latency_ms).label('avg_latency'),
        ).filter(APICall.project_id == project_id)
        
        if start_date:
            model_stats = model_stats.filter(APICall.created_at >= start_date)
        if end_date:
            model_stats = model_stats.filter(APICall.created_at <= end_date)
        
        model_stats = model_stats.group_by(APICall.provider, APICall.model).all()
        
        # Get error breakdown
        error_breakdown = db.query(
            APICall.status_code,
            func.count(APICall.id).label('count')
        ).filter(APICall.project_id == project_id)
        
        if start_date:
            error_breakdown = error_breakdown.filter(APICall.created_at >= start_date)
        if end_date:
            error_breakdown = error_breakdown.filter(APICall.created_at <= end_date)
        
        error_breakdown = error_breakdown.group_by(APICall.status_code).all()
        
        # Get daily statistics
        daily_stats = db.query(
            func.date(APICall.created_at).label('date'),
            func.count(APICall.id).label('call_count'),
            func.sum(APICall.request_tokens).label('input_tokens'),
            func.sum(APICall.response_tokens).label('output_tokens'),
        ).filter(APICall.project_id == project_id)
        
        if start_date:
            daily_stats = daily_stats.filter(APICall.created_at >= start_date)
        if end_date:
            daily_stats = daily_stats.filter(APICall.created_at <= end_date)
        
        daily_stats = daily_stats.group_by(func.date(APICall.created_at)).order_by(func.date(APICall.created_at)).all()
        
        # Calculate costs by model
        from app.services.cost_analyzer import CostAnalyzer
        cost_analyzer = CostAnalyzer()
        cost_by_model = {}
        for stat in model_stats:
            model_key = f"{stat.provider}/{stat.model}"
            model_cost = cost_analyzer.calculate_cost(
                stat.provider,
                stat.model,
                stat.total_input_tokens or 0,
                stat.total_output_tokens or 0
            )
            cost_by_model[model_key] = {
                "calls": stat.call_count,
                "input_tokens": int(stat.total_input_tokens) if stat.total_input_tokens else 0,
                "output_tokens": int(stat.total_output_tokens) if stat.total_output_tokens else 0,
                "avg_latency_ms": round(float(stat.avg_latency), 2) if stat.avg_latency else None,
                "cost": round(model_cost, 2),
            }
        
        report = {
            **base_report,
            "type": "detailed",
            "summary": {
                "total_api_calls": total_calls,
                "successful_calls": successful_calls,
                "failed_calls": total_calls - successful_calls,
                "success_rate": round((successful_calls / total_calls * 100) if total_calls > 0 else 0, 2),
                "total_cost": round(total_cost, 2),
                "quality_scores": {
                    "average": round(float(quality_scores.avg_score), 2) if quality_scores.avg_score else None,
                    "min": round(float(quality_scores.min_score), 2) if quality_scores.min_score else None,
                    "max": round(float(quality_scores.max_score), 2) if quality_scores.max_score else None,
                    "total_evaluations": int(quality_scores.count) if quality_scores.count else 0,
                },
                "drift_detections": {
                    "total": drift_count,
                    "high_severity": high_severity_drifts,
                    "critical": db.query(DriftDetection).filter(
                        DriftDetection.project_id == project_id,
                        DriftDetection.severity == 'critical'
                    ).filter(
                        *([DriftDetection.detected_at >= start_date] if start_date else []),
                        *([DriftDetection.detected_at <= end_date] if end_date else [])
                    ).count(),
                    "medium": db.query(DriftDetection).filter(
                        DriftDetection.project_id == project_id,
                        DriftDetection.severity == 'medium'
                    ).filter(
                        *([DriftDetection.detected_at >= start_date] if start_date else []),
                        *([DriftDetection.detected_at <= end_date] if end_date else [])
                    ).count(),
                    "low": db.query(DriftDetection).filter(
                        DriftDetection.project_id == project_id,
                        DriftDetection.severity == 'low'
                    ).filter(
                        *([DriftDetection.detected_at >= start_date] if start_date else []),
                        *([DriftDetection.detected_at <= end_date] if end_date else [])
                    ).count(),
                },
            },
            "breakdown": {
                "by_model": {
                    "top_models": sorted(
                        [{"model": k, **v} for k, v in cost_by_model.items()],
                        key=lambda x: x["calls"],
                        reverse=True
                    )[:10],
                    "cost_distribution": cost_by_model,
                },
                "by_provider": {},
                "error_breakdown": {
                    str(error.status_code): error.count
                    for error in error_breakdown
                },
                "daily_trends": [
                    {
                        "date": stat.date.isoformat() if stat.date else None,
                        "calls": stat.call_count,
                        "input_tokens": int(stat.input_tokens) if stat.input_tokens else 0,
                        "output_tokens": int(stat.output_tokens) if stat.output_tokens else 0,
                    }
                    for stat in daily_stats
                ],
            },
        }
        
        # Calculate provider breakdown
        provider_stats = db.query(
            APICall.provider,
            func.count(APICall.id).label('call_count'),
            func.sum(APICall.request_tokens).label('total_input_tokens'),
            func.sum(APICall.response_tokens).label('total_output_tokens'),
        ).filter(APICall.project_id == project_id)
        
        if start_date:
            provider_stats = provider_stats.filter(APICall.created_at >= start_date)
        if end_date:
            provider_stats = provider_stats.filter(APICall.created_at <= end_date)
        
        provider_stats = provider_stats.group_by(APICall.provider).all()
        
        report["breakdown"]["by_provider"] = {
            stat.provider: {
                "calls": stat.call_count,
                "input_tokens": int(stat.total_input_tokens) if stat.total_input_tokens else 0,
                "output_tokens": int(stat.total_output_tokens) if stat.total_output_tokens else 0,
            }
            for stat in provider_stats
        }
    
    elif template == "executive":
        # Executive Summary: High-level KPIs and recommendations
        avg_daily_calls = total_calls / ((end_date - start_date).days + 1) if start_date and end_date and (end_date - start_date).days >= 0 else total_calls
        avg_daily_cost = total_cost / ((end_date - start_date).days + 1) if start_date and end_date and (end_date - start_date).days >= 0 else total_cost
        
        # Get top performing models
        top_models_query = db.query(
            APICall.provider,
            APICall.model,
            func.count(APICall.id).label('call_count'),
            func.avg(APICall.latency_ms).label('avg_latency'),
        ).filter(APICall.project_id == project_id)
        
        if start_date:
            top_models_query = top_models_query.filter(APICall.created_at >= start_date)
        if end_date:
            top_models_query = top_models_query.filter(APICall.created_at <= end_date)
        
        top_models = top_models_query.group_by(APICall.provider, APICall.model).order_by(func.count(APICall.id).desc()).limit(5).all()
        
        # Calculate trends (compare first half vs second half of period)
        trends = {}
        if start_date and end_date:
            period_days = (end_date - start_date).days
            if period_days >= 2:
                midpoint = start_date + timedelta(days=period_days // 2)
                
                # First half
                first_half_calls = db.query(func.count(APICall.id)).filter(
                    and_(
                        APICall.project_id == project_id,
                        APICall.created_at >= start_date,
                        APICall.created_at < midpoint
                    )
                ).scalar() or 0
                
                # Second half
                second_half_calls = db.query(func.count(APICall.id)).filter(
                    and_(
                        APICall.project_id == project_id,
                        APICall.created_at >= midpoint,
                        APICall.created_at <= end_date
                    )
                ).scalar() or 0
                
                if first_half_calls > 0:
                    call_trend = ((second_half_calls - first_half_calls) / first_half_calls) * 100
                    trends["api_calls"] = {
                        "first_half": first_half_calls,
                        "second_half": second_half_calls,
                        "change_percentage": round(call_trend, 2),
                        "direction": "increasing" if call_trend > 0 else "decreasing",
                    }
        
        # Generate recommendations
        recommendations = []
        if success_rate < 95:
            recommendations.append({
                "type": "warning",
                "priority": "high",
                "title": "Success Rate Below Target",
                "description": f"Current success rate ({success_rate:.1f}%) is below the recommended 95%. Review error logs and improve error handling.",
            })
        
        if drift_count > 0 and high_severity_drifts > 0:
            recommendations.append({
                "type": "critical",
                "priority": "high",
                "title": "High Severity Drift Detected",
                "description": f"{high_severity_drifts} high or critical severity drift detections found. Investigate model performance changes immediately.",
            })
        
        if quality_scores.avg_score and quality_scores.avg_score < 80:
            recommendations.append({
                "type": "warning",
                "priority": "medium",
                "title": "Quality Score Below Average",
                "description": f"Average quality score ({quality_scores.avg_score:.1f}%) is below recommended threshold. Consider reviewing prompt engineering and model selection.",
            })
        
        if not recommendations:
            recommendations.append({
                "type": "success",
                "priority": "low",
                "title": "System Operating Normally",
                "description": "All metrics are within acceptable ranges. Continue monitoring for optimal performance.",
            })
        
        report = {
            **base_report,
            "type": "executive",
            "key_metrics": {
                "total_api_calls": total_calls,
                "success_rate": round((successful_calls / total_calls * 100) if total_calls > 0 else 0, 2),
                "total_cost": round(total_cost, 2),
                "avg_daily_calls": round(avg_daily_calls, 2),
                "avg_daily_cost": round(avg_daily_cost, 2),
                "avg_quality_score": round(float(quality_scores.avg_score), 2) if quality_scores.avg_score else None,
                "critical_issues": high_severity_drifts,
            },
            "top_performers": [
                {
                    "model": f"{model.provider}/{model.model}",
                    "calls": model.call_count,
                    "avg_latency_ms": round(float(model.avg_latency), 2) if model.avg_latency else None,
                }
                for model in top_models
            ],
            "trends": trends,
            "recommendations": recommendations,
        }
    
    else:
        # Fallback to standard
        report = {
            **base_report,
            "type": "standard",
            "summary": {
                "total_api_calls": total_calls,
                "successful_calls": successful_calls,
                "failed_calls": total_calls - successful_calls,
                "success_rate": round((successful_calls / total_calls * 100) if total_calls > 0 else 0, 2),
                "total_cost": round(total_cost, 2),
                "quality_scores": {
                    "average": round(float(quality_scores.avg_score), 2) if quality_scores.avg_score else None,
                    "min": round(float(quality_scores.min_score), 2) if quality_scores.min_score else None,
                    "max": round(float(quality_scores.max_score), 2) if quality_scores.max_score else None,
                    "total_evaluations": int(quality_scores.count) if quality_scores.count else 0,
                },
                "drift_detections": {
                    "total": drift_count,
                    "high_severity": high_severity_drifts,
                },
            },
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

