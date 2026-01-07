"""
Data export endpoints
"""
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.project import Project
from app.models.api_call import APICall
import csv
import json
import io

router = APIRouter()


class ExportRequest(BaseModel):
    """Export request schema"""
    project_id: int
    format: str  # 'csv' or 'json'
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    status: Optional[str] = None  # 'success', 'error', or None for all


@router.get("/csv")
async def export_csv(
    project_id: int = Query(..., description="Project ID"),
    date_from: Optional[str] = Query(None, description="Start date (ISO format)"),
    date_to: Optional[str] = Query(None, description="End date (ISO format)"),
    provider: Optional[str] = None,
    model: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export API calls as CSV"""
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    # Build query
    query = db.query(APICall).filter(APICall.project_id == project_id)
    
    # Apply filters
    if date_from:
        query = query.filter(APICall.created_at >= datetime.fromisoformat(date_from.replace('Z', '+00:00')))
    if date_to:
        end_date = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        end_date = end_date.replace(hour=23, minute=59, second=59)
        query = query.filter(APICall.created_at <= end_date)
    if provider:
        query = query.filter(APICall.provider == provider)
    if model:
        query = query.filter(APICall.model == model)
    if status == 'success':
        query = query.filter(and_(APICall.status_code >= 200, APICall.status_code < 300))
    elif status == 'error':
        query = query.filter(or_(
            APICall.status_code < 200,
            APICall.status_code >= 300
        ))
    
    # Get all results
    api_calls = query.order_by(APICall.created_at.desc()).all()
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        'ID', 'Created At', 'Provider', 'Model', 'Status Code',
        'Request Tokens', 'Response Tokens', 'Latency (ms)',
        'Agent Name', 'Chain ID', 'Error Message'
    ])
    
    # Write data
    for call in api_calls:
        writer.writerow([
            call.id,
            call.created_at.isoformat(),
            call.provider,
            call.model,
            call.status_code or '',
            call.request_tokens or '',
            call.response_tokens or '',
            call.latency_ms or '',
            call.agent_name or '',
            call.chain_id or '',
            call.error_message or '',
        ])
    
    output.seek(0)
    
    # Return as streaming response
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=api-calls-{project_id}-{datetime.now().strftime('%Y%m%d')}.csv"
        }
    )


@router.get("/json")
async def export_json(
    project_id: int = Query(..., description="Project ID"),
    date_from: Optional[str] = Query(None, description="Start date (ISO format)"),
    date_to: Optional[str] = Query(None, description="End date (ISO format)"),
    provider: Optional[str] = None,
    model: Optional[str] = None,
    status: Optional[str] = None,
    include_data: bool = Query(False, description="Include full request/response data"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export API calls as JSON"""
    # Verify project access
    project = check_project_access(project_id, current_user, db)
    
    # Build query
    query = db.query(APICall).filter(APICall.project_id == project_id)
    
    # Apply filters
    if date_from:
        query = query.filter(APICall.created_at >= datetime.fromisoformat(date_from.replace('Z', '+00:00')))
    if date_to:
        end_date = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        end_date = end_date.replace(hour=23, minute=59, second=59)
        query = query.filter(APICall.created_at <= end_date)
    if provider:
        query = query.filter(APICall.provider == provider)
    if model:
        query = query.filter(APICall.model == model)
    if status == 'success':
        query = query.filter(and_(APICall.status_code >= 200, APICall.status_code < 300))
    elif status == 'error':
        query = query.filter(or_(
            APICall.status_code < 200,
            APICall.status_code >= 300
        ))
    
    # Get all results
    api_calls = query.order_by(APICall.created_at.desc()).all()
    
    # Convert to JSON
    data = []
    for call in api_calls:
        call_data = {
            'id': call.id,
            'created_at': call.created_at.isoformat(),
            'provider': call.provider,
            'model': call.model,
            'status_code': call.status_code,
            'request_tokens': call.request_tokens,
            'response_tokens': call.response_tokens,
            'latency_ms': call.latency_ms,
            'agent_name': call.agent_name,
            'chain_id': call.chain_id,
            'error_message': call.error_message,
        }
        
        if include_data:
            call_data['request_data'] = call.request_data
            call_data['response_data'] = call.response_data
        
        data.append(call_data)
    
    # Return as JSON response
    return {
        'project_id': project_id,
        'exported_at': datetime.utcnow().isoformat(),
        'total_records': len(data),
        'data': data
    }

