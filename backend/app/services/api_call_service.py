from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.api_call import APICall
from app.infrastructure.repositories.api_call_repository import APICallRepository
from app.core.logging_config import logger


class APICallService:
    """Service for API call management business logic"""

    def __init__(
        self,
        api_call_repo: APICallRepository,
        db: Session
    ):
        self.api_call_repo = api_call_repo
        self.db = db

    def get_api_call_by_id(self, api_call_id: int) -> Optional[APICall]:
        """Get API call by ID"""
        return self.api_call_repo.find_by_id(api_call_id)

    def get_api_calls_by_project_id(
        self,
        project_id: int,
        limit: int = 100,
        offset: int = 0,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        agent_name: Optional[str] = None
    ) -> List[APICall]:
        """
        Get API calls for a project with optional filters
        
        Args:
            project_id: Project ID
            limit: Maximum number of results
            offset: Offset for pagination
            provider: Optional provider filter
            model: Optional model filter
            agent_name: Optional agent name filter
        
        Returns:
            List of APICall entities
        """
        # Use repository's find_by_project_id method
        return self.api_call_repo.find_by_project_id(
            project_id=project_id,
            limit=limit,
            offset=offset,
            provider=provider,
            model=model,
            agent_name=agent_name
        )
