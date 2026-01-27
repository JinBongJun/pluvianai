"""
Golden Case Service for extracting test cases from production snapshots
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.snapshot import Snapshot
from app.models.trace import Trace
from app.infrastructure.repositories.snapshot_repository import SnapshotRepository
from app.core.logging_config import logger


class GoldenCaseService:
    """Service for extracting and managing golden test cases"""

    def __init__(self, snapshot_repo: SnapshotRepository, db: Session):
        self.snapshot_repo = snapshot_repo
        self.db = db

    def extract_golden_cases(
        self,
        project_id: int,
        limit: int = 100,
        diversity_threshold: float = 0.3
    ) -> List[Snapshot]:
        """
        Extract diverse test cases from recent snapshots
        Returns up to 'limit' snapshots with diverse scenarios
        """
        # Get recent snapshots
        recent_snapshots = self.snapshot_repo.find_by_project_id(project_id, limit=limit * 2, offset=0)
        
        if not recent_snapshots:
            return []

        # Simple diversity selection: prioritize different models/providers
        # In future, can add more sophisticated diversity metrics (message length, complexity, etc.)
        selected = []
        seen_combinations = set()
        
        for snapshot in recent_snapshots[:limit * 2]:
            # Create diversity key (provider + model + first 50 chars of message)
            messages = snapshot.payload.get("messages", [])
            first_message = messages[0].get("content", "") if messages else ""
            diversity_key = (
                snapshot.provider,
                snapshot.model,
                first_message[:50] if first_message else ""
            )
            
            # If we haven't seen this combination, or we need more diversity
            if diversity_key not in seen_combinations or len(selected) < limit:
                selected.append(snapshot)
                seen_combinations.add(diversity_key)
                
                if len(selected) >= limit:
                    break

        # If we don't have enough diverse cases, fill with remaining
        if len(selected) < limit:
            remaining = [s for s in recent_snapshots if s not in selected]
            selected.extend(remaining[:limit - len(selected)])

        return selected[:limit]

    def get_golden_case_summary(self, project_id: int) -> Dict[str, Any]:
        """
        Get summary of available golden cases
        Returns statistics about test cases
        """
        snapshots = self.snapshot_repo.find_by_project_id(project_id, limit=1000, offset=0)
        
        if not snapshots:
            return {
                "total_snapshots": 0,
                "available_for_testing": 0,
                "by_provider": {},
                "by_model": {},
            }

        # Count by provider and model
        by_provider = {}
        by_model = {}
        
        for snapshot in snapshots:
            provider = snapshot.provider
            model = snapshot.model
            
            by_provider[provider] = by_provider.get(provider, 0) + 1
            by_model[model] = by_model.get(model, 0) + 1

        return {
            "total_snapshots": len(snapshots),
            "available_for_testing": min(len(snapshots), 100),  # Max 100 for testing
            "by_provider": by_provider,
            "by_model": by_model,
        }
