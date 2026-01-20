"""
Infrastructure Cost Monitor for tracking Railway/Vercel costs
"""
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.database import SessionLocal
from app.models.alert import Alert
from app.services.alert_service import AlertService
from app.core.logging_config import logger


class InfrastructureCostMonitor:
    """Service for monitoring infrastructure costs (Railway, Vercel, etc.)"""
    
    def __init__(self):
        self.alert_service = AlertService()
    
    def check_infrastructure_costs(
        self,
        budget_limit: Optional[float] = None,
        days: int = 30,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Check infrastructure costs and compare with budget
        
        Args:
            budget_limit: Optional budget limit (monthly)
            days: Number of days to analyze
            db: Database session (optional)
        
        Returns:
            Dictionary with cost analysis and budget status
        """
        # In a real implementation, would fetch from Railway/Vercel APIs
        # For now, return placeholder structure
        
        result = {
            "current_month_cost": 0.0,
            "estimated_monthly_cost": 0.0,
            "budget_limit": budget_limit,
            "budget_warning": False,
            "budget_exceeded": False,
            "days_analyzed": days,
            "checked_at": datetime.utcnow().isoformat(),
        }
        
        if budget_limit:
            if result["estimated_monthly_cost"] > budget_limit * 1.1:  # 10% over budget
                result["budget_exceeded"] = True
            elif result["estimated_monthly_cost"] > budget_limit * 0.9:  # 90% of budget
                result["budget_warning"] = True
        
        return result
    
    async def check_and_alert(
        self,
        project_id: int,
        budget_limit: Optional[float] = None,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Check costs and send alerts if budget exceeded
        
        Args:
            project_id: Project ID
            budget_limit: Optional budget limit
            db: Database session (optional)
        
        Returns:
            Cost check result
        """
        if not db:
            db = SessionLocal()
            should_close = True
        else:
            should_close = False
        
        try:
            cost_result = self.check_infrastructure_costs(budget_limit, db=db)
            
            # Send alert if budget exceeded
            if cost_result.get("budget_exceeded") or cost_result.get("budget_warning"):
                from app.models.project import Project
                project = db.query(Project).filter(Project.id == project_id).first()
                
                if project:
                    severity = "critical" if cost_result.get("budget_exceeded") else "medium"
                    title = "Budget Exceeded" if cost_result.get("budget_exceeded") else "Budget Warning"
                    message = (
                        f"Infrastructure cost ${cost_result.get('estimated_monthly_cost', 0):.2f}/month "
                        f"exceeds budget of ${budget_limit:.2f}/month"
                        if budget_limit
                        else f"Infrastructure cost is ${cost_result.get('estimated_monthly_cost', 0):.2f}/month"
                    )
                    
                    alert = Alert(
                        project_id=project.id,
                        alert_type="infrastructure_cost",
                        severity=severity,
                        title=title,
                        message=message,
                        alert_data=cost_result,
                        notification_channels=["email"],
                    )
                    db.add(alert)
                    db.commit()
                    
                    await self.alert_service.send_alert(alert, db=db)
            
            return cost_result
        finally:
            if should_close:
                db.close()


# Global instance
infrastructure_cost_monitor = InfrastructureCostMonitor()
