"""
Risk-based authentication helper.

Provides a lightweight heuristic to flag unusual login attempts
based on IP, User-Agent, and recent successful logins.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.login_attempt import LoginAttempt
from app.core.logging_config import logger


@dataclass
class RiskAssessment:
    risk_score: int
    reasons: List[str]
    require_step_up: bool = False


class RiskBasedAuthService:
    """
    Simple heuristic-based RBA.
    """

    def __init__(self, lookback_hours: int = 48):
        self.lookback = timedelta(hours=lookback_hours)

    def _get_last_success(self, db: Session, user_id: int) -> Optional[LoginAttempt]:
        return (
            db.query(LoginAttempt)
            .filter(LoginAttempt.user_id == user_id, LoginAttempt.is_success.is_(True))
            .order_by(LoginAttempt.created_at.desc())
            .first()
        )

    def assess(
        self,
        user_id: Optional[int],
        ip: Optional[str],
        user_agent: Optional[str],
        db: Optional[Session] = None,
    ) -> RiskAssessment:
        if user_id is None:
            return RiskAssessment(risk_score=0, reasons=[], require_step_up=False)

        managed_db = db or SessionLocal()
        try:
            last_success = self._get_last_success(managed_db, user_id)
        finally:
            if db is None:
                managed_db.close()

        reasons: List[str] = []
        risk_score = 0

        if last_success:
            if ip and last_success.ip_address and ip != last_success.ip_address:
                risk_score += 30
                reasons.append("new_ip")
            if user_agent and last_success.user_agent and user_agent[:50] != last_success.user_agent[:50]:
                risk_score += 20
                reasons.append("new_user_agent")
            if last_success.created_at:
                age = datetime.utcnow().replace(tzinfo=last_success.created_at.tzinfo) - last_success.created_at
                if age < timedelta(hours=1):
                    risk_score += 10
                    reasons.append("short_interval")
        else:
            # First login for this user
            risk_score += 10
            reasons.append("first_login")

        require_step_up = risk_score >= 40
        return RiskAssessment(risk_score=risk_score, reasons=reasons, require_step_up=require_step_up)


risk_based_auth_service = RiskBasedAuthService()
