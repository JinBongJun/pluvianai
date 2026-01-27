"""
Base Analysis Service - Common interface for all analysis services
"""
from abc import ABC, abstractmethod
from typing import Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime


class BaseAnalysisService(ABC):
    """Base class for all analysis services with common interface"""
    
    def __init__(self, db: Session):
        self.db = db
    
    @abstractmethod
    def analyze(
        self,
        project_id: int,
        days: int = 7,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform analysis for a project
        
        Args:
            project_id: Project ID
            days: Number of days to analyze
            **kwargs: Service-specific parameters
        
        Returns:
            Dict with analysis results containing:
            - project_id: int
            - analysis_date: str (ISO format)
            - analysis_type: str (e.g., "problem", "dependency", "performance")
            - results: Dict with service-specific results
            - metadata: Dict with analysis metadata
        """
        pass
    
    def _get_common_metadata(
        self,
        project_id: int,
        days: int,
        **kwargs
    ) -> Dict[str, Any]:
        """Get common metadata for analysis results"""
        return {
            "project_id": project_id,
            "analysis_date": datetime.utcnow().isoformat(),
            "days_analyzed": days,
            **kwargs
        }
