"""
Referral (viral) service: codes, credits, and stats.
"""

import secrets
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.logging_config import logger
from app.models.user import User

REFERRAL_CREDITS_PER_SIGNUP = 100  # credits awarded for each successful referral
CODE_LENGTH = 10
CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


class ReferralService:
    def __init__(self, db: Session):
        self.db = db

    def generate_referral_code(self, user_id: int) -> str:
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        if user.referral_code:
            return user.referral_code
        for _ in range(20):
            code = _generate_code()
            exists = self.db.query(User).filter(User.referral_code == code).first()
            if not exists:
                user.referral_code = code
                self.db.commit()
                logger.info(
            "Referral code generated",
            extra={"user_id": user_id, "code": code},
        )
                return code
        raise RuntimeError("Could not generate unique referral code")

    def process_referral(self, referral_code: str, new_user_id: int) -> Dict[str, Any]:
        code = (referral_code or "").strip().lower()
        referrer = self.db.query(User).filter(User.referral_code == code).first()
        if not referrer:
            return {"ok": False, "error": "Invalid referral code"}
        new_user = self.db.query(User).filter(User.id == new_user_id).first()
        if not new_user:
            return {"ok": False, "error": "User not found"}
        if new_user.referred_by is not None:
            return {"ok": False, "error": "User already referred"}
        if new_user.id == referrer.id:
            return {"ok": False, "error": "Cannot use own code"}
        new_user.referred_by = referrer.id
        self.db.commit()
        self.apply_referral_credits(referrer.id)
        logger.info(
            "Referral applied",
            extra={"referrer_id": referrer.id, "new_user_id": new_user_id, "code": referral_code},
        )
        return {"ok": True, "referrer_id": referrer.id, "code": code}

    def apply_referral_credits(self, user_id: int) -> int:
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return 0
        add = REFERRAL_CREDITS_PER_SIGNUP
        current = user.referral_credits or 0
        user.referral_credits = current + add
        self.db.commit()
        logger.info(
            "Referral credits applied",
            extra={"user_id": user_id, "added": add, "total": user.referral_credits},
        )
        return user.referral_credits

    def get_referral_stats(self, user_id: int) -> Dict[str, Any]:
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"code": None, "credits": 0, "referred_count": 0}
        count = self.db.query(func.count(User.id)).filter(User.referred_by == user_id).scalar() or 0
        return {
            "code": user.referral_code,
            "credits": user.referral_credits or 0,
            "referred_count": int(count),
        }
