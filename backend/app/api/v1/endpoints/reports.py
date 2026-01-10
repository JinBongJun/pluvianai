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

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

router = APIRouter()


def generate_pdf_report(report_data: dict, buffer: io.BytesIO) -> None:
    """Generate PDF report from report data"""
    try:
        # Create PDF document
        doc = SimpleDocTemplate(buffer, pagesize=A4, 
                               rightMargin=72, leftMargin=72,
                               topMargin=72, bottomMargin=18)
        
        # Container for the 'Flowable' objects
        elements = []
        
        # Styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#2c3e50'),
            spaceAfter=12,
            spaceBefore=20
        )
        
        normal_style = styles['Normal']
        normal_style.fontSize = 10
        normal_style.textColor = colors.HexColor('#333333')
        
        # Title
        title_text = f"AgentGuard Report - {report_data.get('project_name', 'Project')}"
        elements.append(Paragraph(title_text, title_style))
        elements.append(Spacer(1, 0.2*inch))
        
        # Report metadata
        generated_at = report_data.get('generated_at', datetime.utcnow().isoformat())
        if isinstance(generated_at, str):
            # Handle ISO format with or without timezone
            if generated_at.endswith('Z'):
                generated_at = generated_at.replace('Z', '+00:00')
            try:
                generated_at_str = datetime.fromisoformat(generated_at).strftime('%Y-%m-%d %H:%M:%S UTC')
            except (ValueError, AttributeError):
                generated_at_str = str(generated_at)
        else:
            generated_at_str = str(generated_at)
        
        metadata_data = [
            ['Generated At:', generated_at_str],
            ['Template:', report_data.get('template', 'standard').upper()],
        ]
        
        period = report_data.get('period', {})
        if period and period.get('from'):
            try:
                period_from_str = period['from']
                if isinstance(period_from_str, str):
                    if period_from_str.endswith('Z'):
                        period_from_str = period_from_str.replace('Z', '+00:00')
                    period_from = datetime.fromisoformat(period_from_str).strftime('%Y-%m-%d')
                else:
                    period_from = str(period_from_str)
            except (ValueError, AttributeError):
                period_from = str(period.get('from', 'N/A'))
            
            period_to_str = period.get('to')
            if period_to_str:
                try:
                    if isinstance(period_to_str, str):
                        if period_to_str.endswith('Z'):
                            period_to_str = period_to_str.replace('Z', '+00:00')
                        period_to = datetime.fromisoformat(period_to_str).strftime('%Y-%m-%d')
                    else:
                        period_to = str(period_to_str)
                except (ValueError, AttributeError):
                    period_to = str(period_to_str)
            else:
                period_to = 'N/A'
            
            metadata_data.append(['Period:', f"{period_from} to {period_to}"])
        
        metadata_table = Table(metadata_data, colWidths=[2*inch, 4*inch])
        metadata_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0f0f0')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#333333')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#cccccc')),
        ]))
        elements.append(metadata_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Report content based on template type
        report_type = report_data.get('type', 'standard')
        
        if report_type == 'standard':
            _add_standard_report_content(elements, report_data, heading_style, normal_style)
        elif report_type == 'detailed':
            _add_detailed_report_content(elements, report_data, heading_style, normal_style)
        elif report_type == 'executive':
            _add_executive_report_content(elements, report_data, heading_style, normal_style)
        
        # Build PDF
        doc.build(elements)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise


def _add_standard_report_content(elements: list, report_data: dict, heading_style, normal_style):
    """Add standard report content - concise executive summary"""
    summary = report_data.get('summary', {})
    
    # Executive Summary section with brief intro
    elements.append(Spacer(1, 0.2*inch))
    intro_style = ParagraphStyle(
        'Intro',
        parent=normal_style,
        fontSize=10,
        textColor=colors.HexColor('#555555'),
        spaceAfter=12
    )
    elements.append(Paragraph("This report provides a high-level overview of key performance metrics for the reporting period.", intro_style))
    elements.append(Spacer(1, 0.15*inch))
    
    elements.append(Paragraph("Executive Summary", heading_style))
    
    # Key metrics in a clean table
    summary_data = [
        ['Metric', 'Value'],
        ['Total API Calls', f"{summary.get('total_api_calls', 0):,}"],
        ['Success Rate', f"{summary.get('success_rate', 0):.2f}%"],
        ['Total Cost', f"${summary.get('total_cost', 0):.2f}"],
    ]
    
    quality_scores = summary.get('quality_scores', {})
    if quality_scores.get('average') is not None:
        summary_data.append(['Average Quality Score', f"{quality_scores.get('average', 0):.2f}%"])
    
    drift_detections = summary.get('drift_detections', {})
    if drift_detections.get('total', 0) > 0:
        summary_data.append(['Total Drift Detections', f"{drift_detections.get('total', 0)}"])
        summary_data.append(['High Severity Drifts', f"{drift_detections.get('high_severity', 0)}"])
    
    summary_table = Table(summary_data, colWidths=[3.5*inch, 2.5*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#2c3e50')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Brief conclusion
    conclusion_style = ParagraphStyle(
        'Conclusion',
        parent=normal_style,
        fontSize=10,
        textColor=colors.HexColor('#333333'),
        fontName='Helvetica-Italic'
    )
    elements.append(Paragraph("For detailed analysis and breakdowns, please refer to the Detailed Report template.", conclusion_style))


def _add_detailed_report_content(elements: list, report_data: dict, heading_style, normal_style):
    """Add detailed report content - comprehensive analysis for analysts"""
    summary = report_data.get('summary', {})
    breakdown = report_data.get('breakdown', {})
    
    # Detailed report introduction
    elements.append(Spacer(1, 0.2*inch))
    intro_style = ParagraphStyle(
        'Intro',
        parent=normal_style,
        fontSize=10,
        textColor=colors.HexColor('#555555'),
        spaceAfter=12
    )
    elements.append(Paragraph("This comprehensive report provides detailed analysis including model performance, provider breakdowns, error analysis, and daily trends for in-depth evaluation.", intro_style))
    elements.append(Spacer(1, 0.15*inch))
    
    # Summary section (simplified)
    elements.append(Paragraph("Performance Summary", heading_style))
    summary_data = [
        ['Metric', 'Value'],
        ['Total API Calls', f"{summary.get('total_api_calls', 0):,}"],
        ['Successful Calls', f"{summary.get('successful_calls', 0):,}"],
        ['Failed Calls', f"{summary.get('failed_calls', 0):,}"],
        ['Success Rate', f"{summary.get('success_rate', 0):.2f}%"],
        ['Total Cost', f"${summary.get('total_cost', 0):.2f}"],
    ]
    
    quality_scores = summary.get('quality_scores', {})
    if quality_scores.get('average') is not None:
        summary_data.append(['Average Quality Score', f"{quality_scores.get('average', 0):.2f}%"])
        summary_data.append(['Quality Score Range', f"{quality_scores.get('min', 0):.1f}% - {quality_scores.get('max', 0):.1f}%"])
        summary_data.append(['Total Evaluations', f"{quality_scores.get('total_evaluations', 0):,}"])
    
    drift_detections = summary.get('drift_detections', {})
    if drift_detections.get('total', 0) > 0:
        summary_data.append(['Total Drift Detections', f"{drift_detections.get('total', 0)}"])
        summary_data.append(['Critical Severity', f"{drift_detections.get('critical', 0)}"])
        summary_data.append(['High Severity', f"{drift_detections.get('high_severity', 0)}"])
        summary_data.append(['Medium Severity', f"{drift_detections.get('medium', 0)}"])
        summary_data.append(['Low Severity', f"{drift_detections.get('low', 0)}"])
    
    summary_table = Table(summary_data, colWidths=[3*inch, 3*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#2c3e50')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.3*inch))
    elements.append(PageBreak())
    
    # Top Models by Usage
    if breakdown.get('by_model', {}).get('top_models'):
        elements.append(Paragraph("Model Performance Analysis", heading_style))
        intro_style = ParagraphStyle(
            'SectionIntro',
            parent=normal_style,
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            spaceAfter=10
        )
        elements.append(Paragraph("Top 10 models ranked by API call volume, showing usage patterns and performance metrics.", intro_style))
        elements.append(Spacer(1, 0.1*inch))
        
        top_models = breakdown['by_model']['top_models'][:10]
        models_data = [['Model', 'Calls', 'Input Tokens', 'Output Tokens', 'Avg Latency (s)', 'Cost']]
        for model in top_models:
            avg_latency = (model.get('avg_latency_ms', 0) / 1000) if model.get('avg_latency_ms') else 0
            cost = model.get('cost', 0) if model.get('cost') is not None else 0
            models_data.append([
                model.get('model', 'N/A')[:30],  # Truncate long model names
                f"{model.get('calls', 0):,}",
                f"{model.get('input_tokens', 0):,}",
                f"{model.get('output_tokens', 0):,}",
                f"{avg_latency:.2f}",
                f"${cost:.2f}"
            ])
        
        models_table = Table(models_data, colWidths=[2*inch, 0.75*inch, 0.75*inch, 0.75*inch, 0.75*inch, 0.75*inch])
        models_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d0d0')),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#34495e')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ]))
        elements.append(models_table)
        elements.append(Spacer(1, 0.3*inch))
    
    # Provider Breakdown
    if breakdown.get('by_provider'):
        elements.append(Paragraph("Provider Usage Breakdown", heading_style))
        intro_style = ParagraphStyle(
            'SectionIntro',
            parent=normal_style,
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            spaceAfter=10
        )
        elements.append(Paragraph("Token usage and API call distribution across different LLM providers.", intro_style))
        elements.append(Spacer(1, 0.1*inch))
        
        providers_data = [['Provider', 'Calls', 'Input Tokens', 'Output Tokens', 'Total Tokens']]
        total_tokens_all = 0
        for provider, stats in breakdown['by_provider'].items():
            total_tokens = stats.get('input_tokens', 0) + stats.get('output_tokens', 0)
            total_tokens_all += total_tokens
            providers_data.append([
                provider.capitalize(),
                f"{stats.get('calls', 0):,}",
                f"{stats.get('input_tokens', 0):,}",
                f"{stats.get('output_tokens', 0):,}",
                f"{total_tokens:,}"
            ])
        
        providers_table = Table(providers_data, colWidths=[1.5*inch, 1.2*inch, 1.2*inch, 1.2*inch, 1.2*inch])
        providers_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d0d0')),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#34495e')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ]))
        elements.append(providers_table)
        elements.append(Spacer(1, 0.3*inch))
    
    # Error Breakdown
    if breakdown.get('error_breakdown'):
        elements.append(Paragraph("Error Analysis", heading_style))
        intro_style = ParagraphStyle(
            'SectionIntro',
            parent=normal_style,
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            spaceAfter=10
        )
        elements.append(Paragraph("HTTP status code distribution showing error patterns and failure rates.", intro_style))
        elements.append(Spacer(1, 0.1*inch))
        
        error_breakdown = breakdown.get('error_breakdown', {})
        errors_data = [['Status Code', 'Count', 'Percentage']]
        total_errors = sum(error_breakdown.values())
        for status_code, count in sorted(error_breakdown.items(), key=lambda x: x[1], reverse=True):
            percentage = (count / total_errors * 100) if total_errors > 0 else 0
            errors_data.append([
                status_code,
                f"{count:,}",
                f"{percentage:.2f}%"
            ])
        
        if errors_data:
            errors_table = Table(errors_data, colWidths=[2*inch, 2*inch, 2*inch])
            errors_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d0d0')),
                ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#34495e')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 1), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
            ]))
            elements.append(errors_table)
            elements.append(Spacer(1, 0.3*inch))
    
    # Daily Trends
    if breakdown.get('daily_trends'):
        elements.append(Paragraph("Daily Usage Trends", heading_style))
        intro_style = ParagraphStyle(
            'SectionIntro',
            parent=normal_style,
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            spaceAfter=10
        )
        elements.append(Paragraph("Day-by-day breakdown of API calls and token usage showing usage patterns over time.", intro_style))
        elements.append(Spacer(1, 0.1*inch))
        
        daily_trends = breakdown.get('daily_trends', [])
        trends_data = [['Date', 'Calls', 'Input Tokens', 'Output Tokens', 'Total Tokens']]
        for trend in daily_trends[:30]:  # Limit to last 30 days for readability
            date_str = trend.get('date', '')[:10] if trend.get('date') else 'N/A'  # Extract date part
            input_tokens = trend.get('input_tokens', 0)
            output_tokens = trend.get('output_tokens', 0)
            total_tokens = input_tokens + output_tokens
            trends_data.append([
                date_str,
                f"{trend.get('calls', 0):,}",
                f"{input_tokens:,}",
                f"{output_tokens:,}",
                f"{total_tokens:,}"
            ])
        
        if len(trends_data) > 1:
            trends_table = Table(trends_data, colWidths=[1.2*inch, 1*inch, 1.2*inch, 1.2*inch, 1.2*inch])
            trends_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 7),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d0d0')),
                ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#34495e')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 1), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
            ]))
            elements.append(trends_table)


def _add_executive_report_content(elements: list, report_data: dict, heading_style, normal_style):
    """Add executive report content - high-level KPIs and strategic recommendations"""
    key_metrics = report_data.get('key_metrics', {})
    top_performers = report_data.get('top_performers', [])
    trends = report_data.get('trends', {})
    recommendations = report_data.get('recommendations', [])
    
    # Executive Summary introduction
    elements.append(Spacer(1, 0.2*inch))
    intro_style = ParagraphStyle(
        'Intro',
        parent=normal_style,
        fontSize=10,
        textColor=colors.HexColor('#555555'),
        spaceAfter=12
    )
    elements.append(Paragraph("This executive report provides high-level KPIs, performance trends, and strategic recommendations for decision-makers.", intro_style))
    elements.append(Spacer(1, 0.15*inch))
    
    elements.append(Paragraph("Key Performance Indicators", heading_style))
    
    # KPIs in a professional table format
    kpi_data = [
        ['KPI', 'Value'],
        ['Total API Calls', f"{key_metrics.get('total_api_calls', 0):,}"],
        ['Success Rate', f"{key_metrics.get('success_rate', 0):.2f}%"],
        ['Total Cost', f"${key_metrics.get('total_cost', 0):.2f}"],
        ['Avg Daily Calls', f"{key_metrics.get('avg_daily_calls', 0):.2f}"],
        ['Avg Daily Cost', f"${key_metrics.get('avg_daily_cost', 0):.2f}"],
    ]
    
    if key_metrics.get('avg_quality_score') is not None:
        kpi_data.append(['Avg Quality Score', f"{key_metrics.get('avg_quality_score', 0):.2f}%"])
    kpi_data.append(['Critical Issues', f"{key_metrics.get('critical_issues', 0)}"])
    
    kpi_table = Table(kpi_data, colWidths=[3.5*inch, 2.5*inch])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
        ('LINEBELOW', (0, 0), (-1, 0), 3, colors.HexColor('#1a1a1a')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 1), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
    ]))
    elements.append(kpi_table)
    elements.append(Spacer(1, 0.4*inch))
    
    # Trends section
    if trends:
        elements.append(Paragraph("Performance Trends", heading_style))
        intro_style = ParagraphStyle(
            'SectionIntro',
            parent=normal_style,
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            spaceAfter=10
        )
        elements.append(Paragraph("Comparison between first half and second half of the reporting period.", intro_style))
        elements.append(Spacer(1, 0.1*inch))
        
        trends_data = [['Metric', 'First Half', 'Second Half', 'Change', 'Trend']]
        for trend_key, trend_data in trends.items():
            trend_name = trend_key.replace('_', ' ').title()
            first_half = trend_data.get('first_half', 0)
            second_half = trend_data.get('second_half', 0)
            change_pct = trend_data.get('change_percentage', 0)
            direction = trend_data.get('direction', 'stable')
            
            # Format change percentage with sign
            change_str = f"{change_pct:+.2f}%" if change_pct != 0 else "0.00%"
            trend_icon = "↗" if direction == 'increasing' else "↘" if direction == 'decreasing' else "→"
            
            trends_data.append([
                trend_name,
                f"{first_half:,}",
                f"{second_half:,}",
                change_str,
                trend_icon
            ])
        
        trends_table = Table(trends_data, colWidths=[2*inch, 1.5*inch, 1.5*inch, 1*inch, 0.5*inch])
        trends_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('ALIGN', (4, 0), (4, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d0d0')),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#34495e')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ]))
        elements.append(trends_table)
        elements.append(Spacer(1, 0.3*inch))
    
    # Top Performers
    if top_performers:
        elements.append(Paragraph("Top Performing Models", heading_style))
        intro_style = ParagraphStyle(
            'SectionIntro',
            parent=normal_style,
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            spaceAfter=10
        )
        elements.append(Paragraph("Top 5 models by API call volume with average latency metrics.", intro_style))
        elements.append(Spacer(1, 0.1*inch))
        
        performers_data = [['Model', 'Total Calls', 'Avg Latency (s)']]
        for model in top_performers[:5]:
            avg_latency = (model.get('avg_latency_ms', 0) / 1000) if model.get('avg_latency_ms') else 0
            performers_data.append([
                model.get('model', 'N/A'),
                f"{model.get('calls', 0):,}",
                f"{avg_latency:.2f}"
            ])
        
        performers_table = Table(performers_data, colWidths=[4*inch, 1.2*inch, 1.2*inch])
        performers_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d0d0')),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#34495e')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ]))
        elements.append(performers_table)
        elements.append(Spacer(1, 0.3*inch))
    
    # Recommendations - professional table format instead of colored boxes
    if recommendations:
        elements.append(Paragraph("Strategic Recommendations", heading_style))
        intro_style = ParagraphStyle(
            'SectionIntro',
            parent=normal_style,
            fontSize=9,
            textColor=colors.HexColor('#666666'),
            spaceAfter=10
        )
        elements.append(Paragraph("Actionable recommendations based on performance analysis and trends.", intro_style))
        elements.append(Spacer(1, 0.1*inch))
        
        recs_data = [['Priority', 'Category', 'Recommendation']]
        for rec in recommendations:
            priority = rec.get('priority', 'medium').upper()
            rec_type = rec.get('type', 'info').replace('_', ' ').title()
            title = rec.get('title', '')
            description = rec.get('description', '')
            full_text = f"<b>{title}</b><br/>{description}"
            
            recs_data.append([
                priority,
                rec_type,
                full_text
            ])
        
        recs_table = Table(recs_data, colWidths=[1*inch, 1.2*inch, 4.3*inch])
        
        # Build table style with conditional priority colors
        table_style = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
            ('ALIGN', (2, 0), (2, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (1, -1), 9),
            ('FONTSIZE', (2, 1), (2, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e0e0')),
            ('LINEBELOW', (0, 0), (-1, 0), 3, colors.HexColor('#1a1a1a')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
            ('TOPPADDING', (0, 1), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
            ('LEFTPADDING', (0, 1), (-1, -1), 8),
            ('RIGHTPADDING', (0, 1), (-1, -1), 8),
            ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f5f5f5')),
            ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ]
        
        # Add conditional text colors for priority levels
        for i, rec in enumerate(recommendations, start=1):
            priority = rec.get('priority', 'medium').lower()
            if priority == 'high':
                table_style.append(('TEXTCOLOR', (0, i), (0, i), colors.HexColor('#c0392b')))
            elif priority == 'medium':
                table_style.append(('TEXTCOLOR', (0, i), (0, i), colors.HexColor('#f39c12')))
            else:  # low
                table_style.append(('TEXTCOLOR', (0, i), (0, i), colors.HexColor('#27ae60')))
        
        recs_table.setStyle(TableStyle(table_style))
        elements.append(recs_table)


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
        # Calculate success rate first (needed for recommendations)
        success_rate = round((successful_calls / total_calls * 100) if total_calls > 0 else 0, 2)
        
        # Calculate daily averages
        if start_date and end_date and (end_date - start_date).days >= 0:
            period_days = (end_date - start_date).days + 1
            avg_daily_calls = total_calls / period_days if period_days > 0 else total_calls
            avg_daily_cost = total_cost / period_days if period_days > 0 else total_cost
        else:
            avg_daily_calls = total_calls
            avg_daily_cost = total_cost
        
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
        
        if quality_scores and quality_scores.avg_score and quality_scores.avg_score < 80:
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
                "success_rate": success_rate,
                "total_cost": round(total_cost, 2),
                "avg_daily_calls": round(avg_daily_calls, 2),
                "avg_daily_cost": round(avg_daily_cost, 2),
                "avg_quality_score": round(float(quality_scores.avg_score), 2) if quality_scores and quality_scores.avg_score else None,
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
    elif format == "pdf":
        if not REPORTLAB_AVAILABLE:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="PDF generation library (reportlab) is not installed. Please install it using: pip install reportlab"
            )
        
        try:
            # Generate PDF
            pdf_buffer = io.BytesIO()
            generate_pdf_report(report_data, pdf_buffer)
            pdf_buffer.seek(0)
            
            # Verify PDF was generated successfully
            pdf_content = pdf_buffer.getvalue()
            if not pdf_content or len(pdf_content) < 100:  # PDF should be at least 100 bytes
                raise ValueError("Generated PDF is empty or too small")
            
            # Return as PDF file
            return Response(
                content=pdf_content,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f"attachment; filename=report-{project_id}-{template}-{datetime.now().strftime('%Y%m%d')}.pdf"
                }
            )
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            raise
        except Exception as e:
            # Log the full error for debugging
            import traceback
            error_trace = traceback.format_exc()
            from app.core.logging_config import logger
            logger.error(f"PDF generation failed: {str(e)}\n{error_trace}")
            
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate PDF: {str(e)}. Please check server logs for details."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format: {format}. Supported formats: json, pdf"
        )

