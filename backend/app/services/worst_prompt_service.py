"""
Worst Prompt Service - Automatic collection and management of problematic prompts

Auto-collects:
- Failed responses
- Long responses
- Hallucination suspected
- Customer complaints
- Refusal increases
- JSON breaks
- Latency issues
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from app.core.logging_config import logger


class WorstPromptService:
    """Service for managing worst prompts/test sets"""
    
    DEFAULT_THRESHOLDS = {
        "long_response_chars": 5000,
        "short_response_chars": 50,
        "high_latency_ms": 10000,
        "max_prompts_per_set": 100,
    }
    
    def __init__(self, db: Session):
        self.db = db
    
    def _get_models(self):
        """Lazy import models to avoid circular imports"""
        from app.models.worst_prompt import WorstPrompt, WorstPromptSet, WorstPromptSetMember
        return WorstPrompt, WorstPromptSet, WorstPromptSetMember
    
    def auto_collect_worst_prompt(
        self,
        project_id: int,
        snapshot_id: Optional[int],
        prompt_text: str,
        reason: str,
        response_text: Optional[str] = None,
        severity_score: float = 0.5,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        context: Optional[Dict] = None,
        response_metadata: Optional[Dict] = None,
    ):
        """Automatically collect a worst prompt"""
        WorstPrompt, _, _ = self._get_models()
        
        existing = self.db.query(WorstPrompt).filter(
            WorstPrompt.project_id == project_id,
            WorstPrompt.prompt_text == prompt_text,
            WorstPrompt.reason == reason,
        ).first()
        
        if existing:
            if severity_score > existing.severity_score:
                existing.severity_score = severity_score
                self.db.commit()
            return existing
        
        worst_prompt = WorstPrompt(
            project_id=project_id,
            snapshot_id=snapshot_id,
            prompt_text=prompt_text,
            reason=reason,
            severity_score=severity_score,
            model=model,
            provider=provider,
            context=context,
            original_response=response_text,
            response_metadata=response_metadata,
        )
        
        self.db.add(worst_prompt)
        self.db.commit()
        self.db.refresh(worst_prompt)
        
        self._auto_add_to_sets(project_id, worst_prompt)
        
        return worst_prompt
    
    def collect_from_signals(
        self,
        project_id: int,
        snapshot_id: int,
        signals: List[Dict],
        prompt_text: str,
        response_text: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> List:
        """Collect worst prompts based on detected signals"""
        collected = []
        
        reason_map = {
            "hallucination": "hallucination_suspected",
            "length_change": "long_response",
            "refusal_increase": "refusal_increase",
            "json_schema_break": "json_break",
            "latency_spike": "latency_issue",
            "tool_misuse": "failure_response",
        }
        
        for signal in signals:
            if not signal.get("detected"):
                continue
            
            signal_type = signal.get("signal_type")
            severity = signal.get("severity", "medium")
            
            reason = reason_map.get(signal_type)
            if not reason:
                continue
            
            severity_score = {
                "critical": 1.0,
                "high": 0.8,
                "medium": 0.5,
                "low": 0.3,
            }.get(severity, 0.5)
            
            worst_prompt = self.auto_collect_worst_prompt(
                project_id=project_id,
                snapshot_id=snapshot_id,
                prompt_text=prompt_text,
                reason=reason,
                response_text=response_text,
                severity_score=severity_score,
                model=model,
                provider=provider,
                response_metadata={"signal": signal},
            )
            collected.append(worst_prompt)
        
        return collected
    
    def get_worst_prompts(
        self,
        project_id: int,
        reason: Optional[str] = None,
        is_active: Optional[bool] = True,
        is_reviewed: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List:
        """Get worst prompts for a project with filters"""
        WorstPrompt, _, _ = self._get_models()
        
        query = self.db.query(WorstPrompt).filter(
            WorstPrompt.project_id == project_id
        )
        
        if reason:
            query = query.filter(WorstPrompt.reason == reason)
        if is_active is not None:
            query = query.filter(WorstPrompt.is_active == is_active)
        if is_reviewed is not None:
            query = query.filter(WorstPrompt.is_reviewed == is_reviewed)
        
        return query.order_by(
            desc(WorstPrompt.severity_score),
            desc(WorstPrompt.created_at)
        ).offset(offset).limit(limit).all()
    
    def get_worst_prompt_by_id(self, prompt_id: int):
        """Get a worst prompt by ID"""
        WorstPrompt, _, _ = self._get_models()
        return self.db.query(WorstPrompt).filter(
            WorstPrompt.id == prompt_id
        ).first()
    
    def update_worst_prompt(self, prompt_id: int, **kwargs):
        """Update a worst prompt"""
        prompt = self.get_worst_prompt_by_id(prompt_id)
        if not prompt:
            return None
        
        for key, value in kwargs.items():
            if hasattr(prompt, key):
                setattr(prompt, key, value)
        
        self.db.commit()
        self.db.refresh(prompt)
        return prompt
    
    def mark_as_reviewed(self, prompt_id: int, is_active: bool = True):
        """Mark a worst prompt as reviewed"""
        return self.update_worst_prompt(
            prompt_id,
            is_reviewed=True,
            is_active=is_active,
        )
    
    def delete_worst_prompt(self, prompt_id: int) -> bool:
        """Delete a worst prompt"""
        prompt = self.get_worst_prompt_by_id(prompt_id)
        if not prompt:
            return False
        
        self.db.delete(prompt)
        self.db.commit()
        return True
    
    # Prompt Set Management
    
    def create_prompt_set(
        self,
        project_id: int,
        name: str,
        description: Optional[str] = None,
        auto_collect: bool = True,
        max_prompts: int = 100,
        collection_criteria: Optional[Dict] = None,
    ):
        """Create a new worst prompt set"""
        _, WorstPromptSet, _ = self._get_models()
        
        prompt_set = WorstPromptSet(
            project_id=project_id,
            name=name,
            description=description,
            auto_collect=auto_collect,
            max_prompts=max_prompts,
            collection_criteria=collection_criteria,
        )
        
        self.db.add(prompt_set)
        self.db.commit()
        self.db.refresh(prompt_set)
        return prompt_set
    
    def get_prompt_sets(self, project_id: int) -> List:
        """Get all prompt sets for a project"""
        _, WorstPromptSet, _ = self._get_models()
        return self.db.query(WorstPromptSet).filter(
            WorstPromptSet.project_id == project_id
        ).all()
    
    def get_prompt_set_by_id(self, set_id: int):
        """Get a prompt set by ID"""
        _, WorstPromptSet, _ = self._get_models()
        return self.db.query(WorstPromptSet).filter(
            WorstPromptSet.id == set_id
        ).first()
    
    def add_prompt_to_set(self, set_id: int, prompt_id: int, order: Optional[int] = None):
        """Add a worst prompt to a set"""
        _, WorstPromptSet, WorstPromptSetMember = self._get_models()
        
        prompt_set = self.get_prompt_set_by_id(set_id)
        if not prompt_set:
            return None
        
        existing = self.db.query(WorstPromptSetMember).filter(
            WorstPromptSetMember.prompt_set_id == set_id,
            WorstPromptSetMember.worst_prompt_id == prompt_id
        ).first()
        
        if existing:
            return existing
        
        if order is None:
            max_order = self.db.query(func.max(WorstPromptSetMember.order)).filter(
                WorstPromptSetMember.prompt_set_id == set_id
            ).scalar()
            order = (max_order or 0) + 1
        
        member = WorstPromptSetMember(
            prompt_set_id=set_id,
            worst_prompt_id=prompt_id,
            order=order,
        )
        
        self.db.add(member)
        
        prompt_set.prompt_count = self.db.query(WorstPromptSetMember).filter(
            WorstPromptSetMember.prompt_set_id == set_id
        ).count() + 1
        
        self.db.commit()
        self.db.refresh(member)
        return member
    
    def remove_prompt_from_set(self, set_id: int, prompt_id: int) -> bool:
        """Remove a worst prompt from a set"""
        _, _, WorstPromptSetMember = self._get_models()
        
        member = self.db.query(WorstPromptSetMember).filter(
            WorstPromptSetMember.prompt_set_id == set_id,
            WorstPromptSetMember.worst_prompt_id == prompt_id
        ).first()
        
        if not member:
            return False
        
        self.db.delete(member)
        
        prompt_set = self.get_prompt_set_by_id(set_id)
        if prompt_set:
            prompt_set.prompt_count = self.db.query(WorstPromptSetMember).filter(
                WorstPromptSetMember.prompt_set_id == set_id
            ).count() - 1
        
        self.db.commit()
        return True
    
    def get_prompts_in_set(self, set_id: int) -> List:
        """Get all prompts in a set"""
        _, _, WorstPromptSetMember = self._get_models()
        
        members = self.db.query(WorstPromptSetMember).filter(
            WorstPromptSetMember.prompt_set_id == set_id
        ).order_by(WorstPromptSetMember.order).all()
        
        return [m.worst_prompt for m in members if m.worst_prompt]
    
    def _auto_add_to_sets(self, project_id: int, worst_prompt):
        """Auto-add prompt to sets with auto_collect enabled"""
        _, WorstPromptSet, _ = self._get_models()
        
        sets = self.db.query(WorstPromptSet).filter(
            WorstPromptSet.project_id == project_id,
            WorstPromptSet.auto_collect == True
        ).all()
        
        for prompt_set in sets:
            criteria = prompt_set.collection_criteria or {}
            
            allowed_reasons = criteria.get("reasons", [])
            if allowed_reasons and worst_prompt.reason not in allowed_reasons:
                continue
            
            min_severity = criteria.get("min_severity", 0.0)
            if worst_prompt.severity_score < min_severity:
                continue
            
            if prompt_set.prompt_count >= prompt_set.max_prompts:
                self._remove_lowest_severity_from_set(prompt_set.id)
            
            self.add_prompt_to_set(prompt_set.id, worst_prompt.id)
    
    def _remove_lowest_severity_from_set(self, set_id: int):
        """Remove the lowest severity prompt from a set"""
        _, _, WorstPromptSetMember = self._get_models()
        
        members = self.db.query(WorstPromptSetMember).filter(
            WorstPromptSetMember.prompt_set_id == set_id
        ).all()
        
        if not members:
            return
        
        lowest_member = None
        lowest_severity = float('inf')
        
        for member in members:
            if member.worst_prompt and member.worst_prompt.severity_score < lowest_severity:
                lowest_severity = member.worst_prompt.severity_score
                lowest_member = member
        
        if lowest_member:
            self.db.delete(lowest_member)
            
            prompt_set = self.get_prompt_set_by_id(set_id)
            if prompt_set:
                prompt_set.prompt_count -= 1
    
    def get_worst_prompt_stats(self, project_id: int) -> Dict[str, Any]:
        """Get statistics for worst prompts"""
        WorstPrompt, _, _ = self._get_models()
        
        total = self.db.query(WorstPrompt).filter(
            WorstPrompt.project_id == project_id
        ).count()
        
        active = self.db.query(WorstPrompt).filter(
            WorstPrompt.project_id == project_id,
            WorstPrompt.is_active == True
        ).count()
        
        reviewed = self.db.query(WorstPrompt).filter(
            WorstPrompt.project_id == project_id,
            WorstPrompt.is_reviewed == True
        ).count()
        
        by_reason = {}
        reasons = self.db.query(
            WorstPrompt.reason,
            func.count(WorstPrompt.id)
        ).filter(
            WorstPrompt.project_id == project_id
        ).group_by(WorstPrompt.reason).all()
        
        for reason, count in reasons:
            by_reason[reason] = count
        
        avg_severity = self.db.query(
            func.avg(WorstPrompt.severity_score)
        ).filter(
            WorstPrompt.project_id == project_id
        ).scalar()
        
        return {
            "total": total,
            "active": active,
            "reviewed": reviewed,
            "unreviewed": total - reviewed,
            "by_reason": by_reason,
            "avg_severity": round(avg_severity or 0, 2),
        }
