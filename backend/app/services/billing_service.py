"""
Billing service: Paddle Billing integration and real-time usage tracking.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import logger
from app.core.metrics import billing_webhook_events_total
from app.core.subscription_limits import PLAN_LIMITS
from app.models.subscription import Subscription
from app.models.user import User
from app.services.cache_service import cache_service
from app.utils.idempotency import idempotency_service


def verify_paddle_webhook_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """
    Verify Paddle Billing webhook signature (HMAC-SHA256 over "{ts}:{raw_body}").
    See: https://developer.paddle.com/webhooks/signature-verification
    """
    if not secret or not signature_header:
        return False
    parts: Dict[str, str] = {}
    for segment in signature_header.split(";"):
        segment = segment.strip()
        if "=" in segment:
            k, v = segment.split("=", 1)
            parts[k.strip()] = v.strip()
    ts = parts.get("ts")
    h1 = parts.get("h1")
    if not ts or not h1:
        return False
    try:
        body_str = raw_body.decode("utf-8")
    except UnicodeDecodeError:
        return False
    signed_payload = f"{ts}:{body_str}"
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, h1)


class BillingService:
    """Service for billing (Paddle) and usage tracking"""

    def __init__(self, db: Session):
        self.db = db
        self.paddle_available = bool(settings.PADDLE_API_KEY and settings.PADDLE_API_KEY.strip())

    def _paddle_base_url(self) -> str:
        return (
            "https://sandbox-api.paddle.com"
            if settings.PADDLE_USE_SANDBOX
            else "https://api.paddle.com"
        )

    def _paddle_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.PADDLE_API_KEY}",
            "Content-Type": "application/json",
        }

    def _paddle_post(self, path: str, json_body: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not self.paddle_available:
            return None, "Paddle not configured"
        url = f"{self._paddle_base_url().rstrip('/')}/{path.lstrip('/')}"
        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(url, headers=self._paddle_headers(), json=json_body)
            body = r.json() if r.content else {}
            if r.status_code >= 400:
                err = body.get("error", body) if isinstance(body, dict) else str(body)
                logger.error("Paddle API error %s: %s", r.status_code, err)
                return None, str(err)
            if isinstance(body, dict) and "data" in body:
                return body["data"], None
            return body if isinstance(body, dict) else None, None
        except Exception as e:
            logger.error("Paddle API request failed: %s", str(e), exc_info=True)
            return None, str(e)

    def _paddle_get(self, path: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not self.paddle_available:
            return None, "Paddle not configured"
        url = f"{self._paddle_base_url().rstrip('/')}/{path.lstrip('/')}"
        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.get(url, headers=self._paddle_headers())
            body = r.json() if r.content else {}
            if r.status_code >= 400:
                err = body.get("error", body) if isinstance(body, dict) else str(body)
                logger.error("Paddle API error %s: %s", r.status_code, err)
                return None, str(err)
            if isinstance(body, dict) and "data" in body:
                return body["data"], None
            return body if isinstance(body, dict) else None, None
        except Exception as e:
            logger.error("Paddle API request failed: %s", str(e), exc_info=True)
            return None, str(e)

    def _failed_webhook_key(self, event_id: str) -> str:
        return f"billing:webhook:failed:{event_id}"

    def _record_failed_webhook_event(
        self,
        event_id: str,
        event_type: Optional[str],
        payload: bytes,
        paddle_signature: str,
        error_message: str,
    ) -> None:
        if not cache_service.enabled:
            return
        try:
            doc = {
                "event_id": event_id,
                "event_type": event_type or "unknown",
                "payload": payload.decode("utf-8", errors="ignore"),
                "paddle_signature": paddle_signature or "",
                "error_message": error_message,
                "failed_at": datetime.now(timezone.utc).isoformat(),
            }
            key = self._failed_webhook_key(event_id)
            cache_service.redis_client.setex(key, 7 * 24 * 3600, json.dumps(doc))
        except Exception:
            logger.warning("Failed to store webhook DLQ event", exc_info=True)

    def retry_failed_webhook_event(self, event_id: str) -> Dict[str, Any]:
        if not cache_service.enabled:
            return {"status": "error", "code": "BILLING_DLQ_UNAVAILABLE", "message": "DLQ unavailable"}
        try:
            raw_doc = cache_service.redis_client.get(self._failed_webhook_key(event_id))
            if not raw_doc:
                return {"status": "error", "code": "BILLING_EVENT_NOT_FOUND", "message": "Event not found"}
            doc = json.loads(raw_doc)
            payload = str(doc.get("payload") or "").encode("utf-8")
            signature = str(doc.get("paddle_signature") or "")
            result = self.handle_paddle_webhook(payload, signature)
            if result.get("status") in {"success", "ignored", "duplicate"}:
                cache_service.redis_client.delete(self._failed_webhook_key(event_id))
            return result
        except Exception as e:
            logger.error("Failed to retry webhook event %s: %s", event_id, str(e), exc_info=True)
            return {"status": "error", "code": "BILLING_RETRY_FAILED", "message": str(e)}

    def reconcile_paddle_subscriptions(self, limit: int = 200) -> Dict[str, Any]:
        """
        Reconcile local subscriptions against Paddle subscription status/price.
        Returns summary for ops visibility.
        """
        if not self.paddle_available:
            return {"status": "skipped", "reason": "paddle_not_configured"}

        from app.services.subscription_service import SubscriptionService

        q = (
            self.db.query(Subscription)
            .filter(Subscription.paddle_subscription_id.isnot(None))
            .order_by(Subscription.id.desc())
            .limit(max(1, min(limit, 1000)))
        )
        subs: List[Subscription] = q.all()
        service = SubscriptionService(self.db)

        checked = 0
        fixed = 0
        failed = 0
        for sub in subs:
            checked += 1
            sub_id = (sub.paddle_subscription_id or "").strip()
            if not sub_id:
                continue
            data, err = self._paddle_get(f"subscriptions/{sub_id}")
            if not data:
                failed += 1
                logger.warning(
                    "Billing reconciliation lookup failed",
                    extra={"subscription_id": sub_id, "user_id": sub.user_id, "error": err},
                )
                continue
            price_id = self._paddle_subscription_price_id(data)
            mapped_plan = self._map_paddle_price_id_to_plan_type(price_id) if price_id else None
            normalized_status = self._normalize_paddle_status(str(data.get("status") or "active"))
            if not mapped_plan:
                failed += 1
                logger.warning(
                    "Billing reconciliation unknown price id",
                    extra={"subscription_id": sub_id, "price_id": price_id, "user_id": sub.user_id},
                )
                continue
            if sub.plan_type != mapped_plan or (sub.status or "").lower() != normalized_status:
                try:
                    cbp = data.get("current_billing_period") or {}
                    service.create_or_update_subscription(
                        user_id=sub.user_id,
                        plan_type=mapped_plan,
                        status=normalized_status,
                        paddle_subscription_id=sub_id,
                        paddle_customer_id=data.get("customer_id"),
                        current_period_start=self._parse_paddle_datetime(cbp.get("starts_at")),
                        current_period_end=self._parse_paddle_datetime(cbp.get("ends_at")),
                    )
                    fixed += 1
                    logger.info(
                        "Billing reconciliation fixed local subscription",
                        extra={
                            "subscription_id": sub_id,
                            "user_id": sub.user_id,
                            "plan_type_before": sub.plan_type,
                            "plan_type_after": mapped_plan,
                            "status_after": normalized_status,
                        },
                    )
                except Exception:
                    failed += 1
                    logger.error(
                        "Billing reconciliation apply failed",
                        extra={"subscription_id": sub_id, "user_id": sub.user_id},
                        exc_info=True,
                    )
        return {"status": "success", "checked": checked, "fixed": fixed, "failed": failed}

    def get_current_usage(self, user_id: int) -> Dict[str, Any]:
        """
        Get current usage for user from Redis counters
        Returns real-time usage data
        """
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")
        year_month = now.strftime("%Y-%m")

        daily_key = f"user:{user_id}:usage:daily:{today}"
        monthly_key = f"user:{user_id}:usage:monthly:{year_month}"
        judge_calls_key = f"user:{user_id}:judge_calls:monthly:{year_month}"
        snapshots_key = f"user:{user_id}:snapshots:monthly:{year_month}"

        daily_usage = int(cache_service.redis_client.get(daily_key) or 0) if cache_service.enabled else 0
        monthly_usage = int(cache_service.redis_client.get(monthly_key) or 0) if cache_service.enabled else 0
        judge_calls = int(cache_service.redis_client.get(judge_calls_key) or 0) if cache_service.enabled else 0
        snapshots = int(cache_service.redis_client.get(snapshots_key) or 0) if cache_service.enabled else 0

        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        plan_type = subscription.plan_type if subscription else "free"
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        soft_caps = self._get_soft_caps(plan_type)

        return {
            "daily_usage": daily_usage,
            "monthly_usage": monthly_usage,
            "judge_calls": judge_calls,
            "snapshots": snapshots,
            "plan_type": plan_type,
            "limits": {
                "api_calls_per_month": limits.get("api_calls_per_month", 1000),
                "snapshots_per_month": soft_caps.get("snapshots", 500),
                "judge_calls_per_month": soft_caps.get("judge_calls", 100),
            },
            "soft_caps": soft_caps,
        }

    def increment_usage(
        self,
        user_id: int,
        metric_type: str,
        amount: int = 1,
        project_id: Optional[int] = None,
    ) -> Tuple[bool, Optional[str]]:
        """
        Increment usage counter in Redis
        Returns: (is_allowed, warning_message)
        """
        if not cache_service.enabled:
            logger.warning(f"Redis not available, usage tracking disabled for user {user_id}")
            return (True, None)

        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")
        year_month = now.strftime("%Y-%m")

        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        plan_type = subscription.plan_type if subscription else "free"
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])
        soft_caps = self._get_soft_caps(plan_type)

        if metric_type == "api_calls":
            counter_key = f"user:{user_id}:usage:monthly:{year_month}"
            limit = limits.get("api_calls_per_month", 1000)
        elif metric_type == "snapshots":
            counter_key = f"user:{user_id}:snapshots:monthly:{year_month}"
            limit = soft_caps.get("snapshots", 500)
        elif metric_type == "judge_calls":
            counter_key = f"user:{user_id}:judge_calls:monthly:{year_month}"
            limit = soft_caps.get("judge_calls", 100)
        else:
            return (True, None)

        if limit == -1:
            current = cache_service.redis_client.incrby(counter_key, amount)
            cache_service.redis_client.expire(counter_key, self._get_seconds_until_month_end())
            return (True, None)

        current = int(cache_service.redis_client.get(counter_key) or 0)
        new_total = current + amount

        if new_total > limit:
            if plan_type == "free" and settings.ENABLE_FREE_PLAN_HARD_LIMIT:
                error_message = (
                    f"Free plan limit exceeded: {current} / {limit} {metric_type}. "
                    "Please upgrade your plan to continue."
                )
                logger.warning(f"User {user_id} blocked by hard limit for {metric_type}: {current}/{limit}")
                return (False, error_message)
            warning = f"Soft cap exceeded: {new_total} / {limit} {metric_type}. Consider upgrading."
            cache_service.redis_client.incrby(counter_key, amount)
            cache_service.redis_client.expire(counter_key, self._get_seconds_until_month_end())
            logger.warning(f"User {user_id} exceeded soft cap for {metric_type}: {new_total}/{limit}")
            return (True, warning)

        cache_service.redis_client.incrby(counter_key, amount)
        cache_service.redis_client.expire(counter_key, self._get_seconds_until_month_end())

        if metric_type == "api_calls":
            daily_key = f"user:{user_id}:usage:daily:{now.strftime('%Y-%m-%d')}"
            cache_service.redis_client.incrby(daily_key, amount)
            cache_service.redis_client.expire(daily_key, 86400)

        return (True, None)

    def _get_soft_caps(self, plan_type: str) -> Dict[str, int]:
        soft_caps = {
            "free": {"snapshots": 500, "judge_calls": 100},
            "indie": {"snapshots": 10000, "judge_calls": 1000},
            "startup": {"snapshots": 50000, "judge_calls": 10000},
            "pro": {"snapshots": 100000, "judge_calls": 100000},
            "enterprise": {"snapshots": 1000000, "judge_calls": 1000000},
        }
        return soft_caps.get(plan_type, soft_caps["free"])

    def _get_seconds_until_month_end(self) -> int:
        now = datetime.now(timezone.utc)
        if now.month == 12:
            next_month = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0)
        else:
            next_month = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0)

        delta = next_month - now
        return int(delta.total_seconds())

    def check_soft_cap_exceeded(self, user_id: int, metric_type: str) -> Tuple[bool, Optional[str]]:
        usage = self.get_current_usage(user_id)
        plan_type = usage["plan_type"]
        soft_caps = self._get_soft_caps(plan_type)

        if metric_type == "snapshots":
            current = usage["snapshots"]
            limit = soft_caps.get("snapshots", 500)
        elif metric_type == "judge_calls":
            current = usage["judge_calls"]
            limit = soft_caps.get("judge_calls", 100)
        else:
            return (False, None)

        if current > limit:
            return (True, f"Soft cap exceeded: {current} / {limit}. Fair Use Policy applies.")

        return (False, None)

    def create_checkout_session(
        self,
        user_id: int,
        plan_type: str,
        success_url: str,
        cancel_url: str,
    ) -> Optional[Dict[str, Any]]:
        """Create a Paddle transaction and return checkout URL (and transaction id)."""
        if not self.paddle_available:
            logger.error("Paddle not configured (missing PADDLE_API_KEY)")
            return None

        price_id = self._get_paddle_price_id(plan_type)
        if not price_id:
            logger.error(f"No Paddle price ID configured for plan {plan_type}")
            return None

        customer_id = self._get_or_create_paddle_customer(user_id)
        if not customer_id:
            logger.error(f"Failed to get or create Paddle customer for user {user_id}")
            return None

        payload: Dict[str, Any] = {
            "items": [{"price_id": price_id, "quantity": 1}],
            "customer_id": customer_id,
            "collection_mode": "automatic",
            "custom_data": {
                "user_id": str(user_id),
                "plan_type": plan_type,
                "success_url": success_url,
                "cancel_url": cancel_url,
            },
        }
        checkout: Dict[str, Any] = {}
        if success_url:
            checkout["url"] = success_url
        if checkout:
            payload["checkout"] = checkout

        data, err = self._paddle_post("transactions", payload)
        if not data:
            logger.error(f"Failed to create Paddle transaction: {err}")
            return None

        checkout_obj = data.get("checkout") or {}
        url = checkout_obj.get("url")
        if not url:
            logger.error("Paddle transaction created but no checkout.url in response")
            return None

        return {
            "session_id": data.get("id"),
            "url": url,
        }

    def handle_paddle_webhook(self, payload: bytes, paddle_signature: str) -> Dict[str, Any]:
        """Verify signature and handle Paddle Billing webhook events."""
        def _record(result: str, ev_type: str | None) -> None:
            billing_webhook_events_total.labels(
                result=result,
                event_type=(ev_type or "unknown"),
            ).inc()
            if not cache_service.enabled:
                return
            # Rolling ratio alarms for quick ops detection.
            try:
                window = max(60, int(settings.BILLING_WEBHOOK_ALERT_WINDOW_SECONDS))
                total_key = "billing:webhook:stats:total"
                result_key = f"billing:webhook:stats:{result}"
                total = cache_service.redis_client.incr(total_key)
                cache_service.redis_client.expire(total_key, window)
                part = cache_service.redis_client.incr(result_key)
                cache_service.redis_client.expire(result_key, window)
                if total <= 0:
                    return
                ratio = float(part) / float(total)
                if result == "error" and ratio >= float(settings.BILLING_WEBHOOK_ERROR_RATIO_THRESHOLD):
                    logger.error(
                        "Billing webhook error ratio exceeded threshold",
                        extra={"ratio": ratio, "threshold": settings.BILLING_WEBHOOK_ERROR_RATIO_THRESHOLD},
                    )
                if result == "duplicate" and ratio >= float(settings.BILLING_WEBHOOK_DUPLICATE_RATIO_THRESHOLD):
                    logger.warning(
                        "Billing webhook duplicate ratio exceeded threshold",
                        extra={"ratio": ratio, "threshold": settings.BILLING_WEBHOOK_DUPLICATE_RATIO_THRESHOLD},
                    )
            except Exception:
                logger.warning("Failed to update webhook ratio counters", exc_info=True)

        if not self.paddle_available:
            logger.warning("Paddle webhook rejected: Paddle not configured")
            _record("error", "config")
            return {"error": "Paddle not configured"}

        secret = settings.PADDLE_WEBHOOK_SECRET or ""
        if not paddle_signature:
            logger.warning("Paddle webhook rejected: Missing Paddle-Signature header")
            _record("error", "signature")
            return {"error": "Missing Paddle-Signature header"}
        if not verify_paddle_webhook_signature(payload, paddle_signature, secret):
            logger.warning("Paddle webhook rejected: Invalid signature")
            _record("error", "signature")
            return {"error": "Invalid signature"}

        try:
            event = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            logger.warning("Paddle webhook rejected: Invalid payload")
            _record("error", "payload")
            return {"error": "Invalid payload"}

        event_type = event.get("event_type")
        data = event.get("data") or {}
        event_id = event.get("event_id") or event.get("id") or hashlib.sha256(payload).hexdigest()
        raw_event_id = event.get("event_id") or event.get("id")
        idem_key = f"paddle:webhook:{raw_event_id}" if raw_event_id else None
        if idem_key:
            cached = idempotency_service.get(idem_key)
            if isinstance(cached, dict):
                _record("duplicate", event_type)
                logger.info(
                    "Duplicate Paddle webhook ignored",
                    extra={"event_id": event_id, "event_type": event_type},
                )
                return {
                    "status": "duplicate",
                    "message": "Webhook already processed",
                    "event_type": event_type,
                    "event_id": event_id,
                    "result": cached,
                }
                

        result: Dict[str, Any]
        if event_type == "transaction.completed":
            result = self._handle_transaction_completed(data, event_type)
        elif event_type == "subscription.updated":
            result = self._handle_subscription_updated(data, event_type)
        elif event_type in ("subscription.canceled", "subscription.cancelled"):
            result = self._handle_subscription_canceled(data, event_type)
        else:
            logger.info(f"Unhandled Paddle webhook event type: {event_type}")
            result = {
                "status": "ignored",
                "message": f"Event type {event_type} not handled",
                "event_type": event_type,
            }

        if idem_key and result.get("status") in {"success", "ignored"}:
            idempotency_service.set(idem_key, result)
        result["event_id"] = event_id
        if str(result.get("status")) == "error":
            self._record_failed_webhook_event(
                event_id=event_id,
                event_type=event_type,
                payload=payload,
                paddle_signature=paddle_signature,
                error_message=str(result.get("message") or "Webhook processing failed"),
            )
        _record(str(result.get("status") or "unknown"), event_type)
        logger.info(
            "Processed Paddle webhook",
            extra={"event_id": event_id, "event_type": event_type, "status": result.get("status")},
        )
        return result

    def _handle_transaction_completed(self, data: Dict[str, Any], event_type: str) -> Dict[str, Any]:
        custom = data.get("custom_data") or {}
        user_id_raw = custom.get("user_id")
        plan_type = custom.get("plan_type")

        if user_id_raw is None or plan_type is None:
            logger.warning(
                "transaction.completed missing user_id or plan_type in custom_data",
                extra={"event_type": event_type, "transaction_id": data.get("id")},
            )
            return {
                "status": "error",
                "message": "Missing transaction custom_data (user_id, plan_type)",
                "event_type": event_type,
            }

        try:
            user_id = int(user_id_raw)
        except (TypeError, ValueError):
            logger.warning(
                "transaction.completed has invalid user_id in custom_data",
                extra={"event_type": event_type, "user_id_raw": user_id_raw},
            )
            return {
                "status": "error",
                "message": "Invalid user_id in transaction custom_data",
                "event_type": event_type,
            }

        plan_str = str(plan_type).strip()
        if not plan_str:
            return {
                "status": "error",
                "message": "Invalid plan_type in transaction custom_data",
                "event_type": event_type,
            }

        from app.services.subscription_service import SubscriptionService

        subscription_service = SubscriptionService(self.db)
        sub_id = data.get("subscription_id")
        cust_id = data.get("customer_id")
        subscription_service.create_or_update_subscription(
            user_id=user_id,
            plan_type=plan_str,
            status="active",
            paddle_subscription_id=sub_id if sub_id else None,
            paddle_customer_id=cust_id if cust_id else None,
        )

        logger.info(
            f"Subscription updated via Paddle webhook for user {user_id}: {plan_str}",
            extra={"user_id": user_id, "plan_type": plan_str, "event_type": event_type},
        )
        return {"status": "success", "message": "Subscription updated", "event_type": event_type}

    def _paddle_subscription_price_id(self, data: Dict[str, Any]) -> Optional[str]:
        items = data.get("items") or []
        if not items:
            return None
        price = items[0].get("price") or {}
        return price.get("id")

    def _normalize_paddle_status(self, status: str) -> str:
        s = (status or "").lower()
        if s == "canceled":
            return "cancelled"
        return s

    def _parse_paddle_datetime(self, value: Any) -> Optional[datetime]:
        if not value or not isinstance(value, str):
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    def _handle_subscription_updated(self, data: Dict[str, Any], event_type: str) -> Dict[str, Any]:
        customer_id = data.get("customer_id")
        if not customer_id:
            return {"status": "error", "message": "Missing customer ID", "event_type": event_type}

        user = self._get_user_by_paddle_customer_id(customer_id)
        if not user:
            logger.warning(f"User not found for Paddle customer {customer_id}")
            return {"status": "error", "message": "User not found", "event_type": event_type}

        price_id = self._paddle_subscription_price_id(data)
        if not price_id:
            logger.error(f"Paddle subscription {data.get('id')} missing price id")
            return {"status": "error", "message": "Missing price ID", "event_type": event_type}

        plan_type = self._map_paddle_price_id_to_plan_type(price_id)
        if not plan_type:
            logger.error(f"Unknown Paddle price ID: {price_id}")
            return {"status": "error", "message": "Unknown price ID", "event_type": event_type}

        cbp = data.get("current_billing_period") or {}
        period_start = self._parse_paddle_datetime(cbp.get("starts_at"))
        period_end = self._parse_paddle_datetime(cbp.get("ends_at"))
        status = self._normalize_paddle_status(str(data.get("status") or "active"))

        from app.services.subscription_service import SubscriptionService

        subscription_service = SubscriptionService(self.db)
        try:
            subscription_service.create_or_update_subscription(
                user_id=user.id,
                plan_type=plan_type,
                status=status,
                paddle_subscription_id=data.get("id"),
                paddle_customer_id=customer_id,
                current_period_start=period_start,
                current_period_end=period_end,
            )
        except Exception as e:
            logger.error(f"Error processing subscription update: {str(e)}", exc_info=True)
            return {"status": "error", "message": str(e), "event_type": event_type}

        logger.info(
            f"Subscription updated via Paddle for user {user.id}: {plan_type} ({status})",
            extra={
                "user_id": user.id,
                "plan_type": plan_type,
                "status": status,
                "event_type": event_type,
                "subscription_id": data.get("id"),
            },
        )
        return {"status": "success", "message": "Subscription updated", "event_type": event_type}

    def _handle_subscription_canceled(self, data: Dict[str, Any], event_type: str) -> Dict[str, Any]:
        customer_id = data.get("customer_id")
        if not customer_id:
            return {"status": "error", "message": "Missing customer ID", "event_type": event_type}

        user = self._get_user_by_paddle_customer_id(customer_id)
        if not user:
            logger.warning(f"User not found for Paddle customer {customer_id}")
            return {"status": "error", "message": "User not found", "event_type": event_type}

        from app.services.subscription_service import SubscriptionService

        subscription_service = SubscriptionService(self.db)
        try:
            subscription_service.create_or_update_subscription(
                user_id=user.id,
                plan_type="free",
                status="cancelled",
                paddle_subscription_id=data.get("id"),
                paddle_customer_id=customer_id,
            )
        except Exception as e:
            logger.error(f"Error processing subscription cancellation: {str(e)}", exc_info=True)
            return {"status": "error", "message": str(e), "event_type": event_type}

        logger.info(
            f"Subscription cancelled via Paddle for user {user.id}",
            extra={"user_id": user.id, "event_type": event_type, "subscription_id": data.get("id")},
        )
        return {"status": "success", "message": "Subscription cancelled", "event_type": event_type}

    def _get_paddle_price_id(self, plan_type: str) -> Optional[str]:
        price_ids = {
            "indie": getattr(settings, "PADDLE_PRICE_ID_INDIE", None),
            "startup": getattr(settings, "PADDLE_PRICE_ID_STARTUP", None),
            "pro": getattr(settings, "PADDLE_PRICE_ID_PRO", None),
            "enterprise": getattr(settings, "PADDLE_PRICE_ID_ENTERPRISE", None),
        }
        return price_ids.get(plan_type)

    def _map_paddle_price_id_to_plan_type(self, price_id: str) -> Optional[str]:
        mapping = {
            getattr(settings, "PADDLE_PRICE_ID_INDIE", None): "indie",
            getattr(settings, "PADDLE_PRICE_ID_STARTUP", None): "startup",
            getattr(settings, "PADDLE_PRICE_ID_PRO", None): "pro",
            getattr(settings, "PADDLE_PRICE_ID_ENTERPRISE", None): "enterprise",
        }
        mapping = {k: v for k, v in mapping.items() if k}
        return mapping.get(price_id)

    def _get_user_email(self, user_id: int) -> Optional[str]:
        user = self.db.query(User).filter(User.id == user_id).first()
        return user.email if user else None

    def _get_or_create_paddle_customer(self, user_id: int) -> Optional[str]:
        if not self.paddle_available:
            return None
        try:
            user = self.db.query(User).filter(User.id == user_id).first()
            if not user:
                logger.error(f"User {user_id} not found")
                return None
            if user.paddle_customer_id:
                return user.paddle_customer_id

            payload = {
                "email": user.email,
                "name": user.full_name,
                "custom_data": {"user_id": str(user_id)},
            }
            data, err = self._paddle_post("customers", payload)
            if not data or not data.get("id"):
                logger.error(f"Paddle customer create failed: {err}")
                return None

            cid = data["id"]
            user.paddle_customer_id = cid
            self.db.commit()
            self.db.refresh(user)
            logger.info(f"Created Paddle customer {cid} for user {user_id}")
            return cid
        except Exception as e:
            logger.error(f"Failed to get or create Paddle customer for user {user_id}: {str(e)}", exc_info=True)
            self.db.rollback()
            return None

    def _get_user_by_paddle_customer_id(self, customer_id: str) -> Optional[User]:
        try:
            return self.db.query(User).filter(User.paddle_customer_id == customer_id).first()
        except Exception as e:
            logger.error(f"Error looking up user by Paddle customer ID {customer_id}: {str(e)}", exc_info=True)
            return None
