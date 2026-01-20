"""
Webhook service for triggering webhooks on events
"""

import httpx
import json
import hmac
import hashlib
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.webhook import Webhook
from app.models.alert import Alert
from app.core.logging_config import logger


class WebhookService:
    """Service for triggering webhooks on events"""

    async def trigger_webhooks(
        self, event_type: str, project_id: int, event_data: Dict[str, Any], db: Session
    ) -> Dict[str, Any]:
        """
        Trigger webhooks for a specific event type

        Args:
            event_type: Type of event (drift, cost_spike, error, etc.)
            project_id: Project ID
            event_data: Event data to send
            db: Database session

        Returns:
            Dictionary with trigger results
        """
        # Get active webhooks for this project or user-level webhooks
        from app.models.project import Project

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"error": "Project not found"}

        # Get project-specific webhooks
        project_webhooks = db.query(Webhook).filter(Webhook.project_id == project_id, Webhook.is_active == True).all()

        # Get user-level webhooks (project_id is None)
        user_webhooks = (
            db.query(Webhook)
            .filter(Webhook.user_id == project.owner_id, Webhook.project_id.is_(None), Webhook.is_active == True)
            .all()
        )

        all_webhooks = list(project_webhooks) + list(user_webhooks)

        # Filter webhooks that subscribe to this event type
        relevant_webhooks = [wh for wh in all_webhooks if event_type in (wh.events or [])]

        if not relevant_webhooks:
            return {"triggered": 0, "total": 0, "message": "No webhooks found for this event type"}

        results = {"triggered": 0, "failed": 0, "total": len(relevant_webhooks), "details": []}

        # Prepare payload
        payload = {
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "project_id": project_id,
            "data": event_data,
        }

        # Trigger each webhook
        for webhook in relevant_webhooks:
            try:
                result = await self._trigger_webhook(webhook, payload, db)

                if result["status"] == "sent":
                    results["triggered"] += 1
                    # Update webhook status
                    webhook.last_triggered_at = datetime.utcnow()
                    if webhook.failure_count > 0:
                        webhook.failure_count = 0
                        webhook.last_error = None
                else:
                    results["failed"] += 1
                    webhook.failure_count = (webhook.failure_count or 0) + 1
                    webhook.last_error = result.get("message", "Unknown error")

                db.commit()

                results["details"].append(
                    {
                        "webhook_id": webhook.id,
                        "webhook_name": webhook.name,
                        "status": result["status"],
                        "message": result.get("message"),
                    }
                )

            except Exception as e:
                results["failed"] += 1
                webhook.failure_count = (webhook.failure_count or 0) + 1
                webhook.last_error = str(e)
                db.commit()

                logger.error(f"Error triggering webhook {webhook.id}: {str(e)}")
                results["details"].append(
                    {"webhook_id": webhook.id, "webhook_name": webhook.name, "status": "error", "message": str(e)}
                )

        return results

    async def _trigger_webhook(self, webhook: Webhook, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        """Trigger a single webhook"""
        try:
            # Sign payload if secret exists
            headers = {"Content-Type": "application/json"}
            if webhook.secret:
                signature = hmac.new(
                    webhook.secret.encode(), json.dumps(payload, sort_keys=True).encode(), hashlib.sha256
                ).hexdigest()
                headers["X-AgentGuard-Signature"] = f"sha256={signature}"

            # Send webhook
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(webhook.url, json=payload, headers=headers)

                if response.status_code >= 200 and response.status_code < 300:
                    return {"status": "sent", "message": "Webhook triggered successfully"}
                else:
                    error_msg = f"Webhook returned status {response.status_code}"
                    try:
                        error_body = response.json()
                        error_msg = error_body.get("message", error_msg)
                    except Exception:
                        error_msg = response.text or error_msg

                    return {"status": "error", "message": error_msg}

        except httpx.TimeoutException:
            return {"status": "error", "message": "Webhook timeout"}
        except Exception as e:
            logger.error(f"Error triggering webhook {webhook.id}: {str(e)}")
            return {"status": "error", "message": str(e)}

    async def trigger_alert_webhooks(self, alert: Alert, db: Session) -> Dict[str, Any]:
        """Trigger webhooks for an alert"""
        event_data = {
            "alert_id": alert.id,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "title": alert.title,
            "message": alert.message,
            "alert_data": alert.alert_data,
        }

        return await self.trigger_webhooks(
            event_type=alert.alert_type, project_id=alert.project_id, event_data=event_data, db=db
        )


# Global instance
webhook_service = WebhookService()
