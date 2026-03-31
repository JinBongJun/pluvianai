from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.subscription_limits import PLAN_LIMITS, normalize_plan_type
from app.models.entitlement_snapshot import EntitlementSnapshot
from app.models.subscription import Subscription


def _as_aware_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class EntitlementService:
    """Computes and stores the effective user-facing plan state."""

    def __init__(self, db: Session):
        self.db = db

    def _build_snapshot_payload(
        self,
        subscription: Optional[Subscription],
        *,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        current_time = now or datetime.now(timezone.utc)
        status = str(subscription.status if subscription else "free").strip().lower()
        if status == "canceled":
            status = "cancelled"

        plan_type = normalize_plan_type(subscription.plan_type if subscription else "free")
        effective_from = _as_aware_utc(subscription.current_period_start if subscription else None) or current_time
        effective_to = _as_aware_utc(subscription.current_period_end if subscription else None)

        if subscription is None or status == "free":
            effective_plan_id = "free"
            entitlement_status = "free"
            effective_to = None
        elif status in {"active", "trialing"}:
            effective_plan_id = plan_type
            entitlement_status = "active"
        elif status == "cancelled":
            if effective_to is not None and effective_to > current_time:
                effective_plan_id = plan_type
                entitlement_status = "active_until_period_end"
            else:
                effective_plan_id = "free"
                entitlement_status = "expired"
        elif status == "past_due":
            effective_plan_id = plan_type
            entitlement_status = "grace_period"
        elif status == "paused":
            effective_plan_id = plan_type
            entitlement_status = "suspended"
        else:
            effective_plan_id = "free"
            entitlement_status = "free"
            effective_to = None

        limits = PLAN_LIMITS.get(effective_plan_id, PLAN_LIMITS["free"])
        return {
            "subscription_id": subscription.id if subscription else None,
            "subscription_status": status,
            "effective_plan_id": effective_plan_id,
            "entitlement_status": entitlement_status,
            "effective_from": effective_from,
            "effective_to": effective_to,
            "limits_json": {k: v for k, v in limits.items() if k != "features"},
            "features_json": dict(limits.get("features", {})),
        }

    def get_current_snapshot(self, user_id: int) -> Optional[EntitlementSnapshot]:
        return (
            self.db.query(EntitlementSnapshot)
            .filter(EntitlementSnapshot.user_id == user_id)
            .order_by(EntitlementSnapshot.created_at.desc(), EntitlementSnapshot.id.desc())
            .first()
        )

    def sync_current_entitlement(
        self,
        user_id: int,
        *,
        subscription: Optional[Subscription] = None,
        source: str = "system",
    ) -> EntitlementSnapshot:
        subscription = subscription or self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        payload = self._build_snapshot_payload(subscription)
        latest = self.get_current_snapshot(user_id)

        if latest and (
            latest.subscription_id == payload["subscription_id"]
            and latest.effective_plan_id == payload["effective_plan_id"]
            and latest.entitlement_status == payload["entitlement_status"]
            and latest.effective_from == payload["effective_from"]
            and latest.effective_to == payload["effective_to"]
            and latest.limits_json == payload["limits_json"]
            and latest.features_json == payload["features_json"]
        ):
            return latest

        snapshot = EntitlementSnapshot(
            user_id=user_id,
            subscription_id=payload["subscription_id"],
            effective_plan_id=payload["effective_plan_id"],
            entitlement_status=payload["entitlement_status"],
            effective_from=payload["effective_from"],
            effective_to=payload["effective_to"],
            limits_json=payload["limits_json"],
            features_json=payload["features_json"],
            source=source,
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot

    def get_or_create_current_entitlement(self, user_id: int, *, source: str = "system") -> EntitlementSnapshot:
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        latest = self.get_current_snapshot(user_id)
        payload = self._build_snapshot_payload(subscription)

        if latest and (
            latest.subscription_id == payload["subscription_id"]
            and latest.effective_plan_id == payload["effective_plan_id"]
            and latest.entitlement_status == payload["entitlement_status"]
            and latest.effective_from == payload["effective_from"]
            and latest.effective_to == payload["effective_to"]
            and latest.limits_json == payload["limits_json"]
            and latest.features_json == payload["features_json"]
        ):
            return latest
        return self.sync_current_entitlement(user_id, subscription=subscription, source=source)
