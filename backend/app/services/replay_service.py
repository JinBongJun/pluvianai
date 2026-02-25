import asyncio
import httpx
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.snapshot import Snapshot
from app.models.evaluation_rubric import EvaluationRubric
from app.api.v1.endpoints.proxy import PROVIDER_URLS
from app.core.logging_config import logger
from app.core.config import settings
from app.services.signal_detection_service import SignalDetectionService
from app.services.review_service import ReviewService
from app.models.alert import Alert
from app.services.data_normalizer import DataNormalizer
from app.models.replay_run import ReplayRun

class ReplayService:
    """Service for re-executing historical AI requests for testing"""

    def __init__(self, max_concurrency: int = 50):
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self.timeout = httpx.Timeout(60.0)

    async def replay_snapshot(
        self,
        snapshot: Snapshot,
        new_model: Optional[str] = None,
        new_system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        replay_overrides: Optional[Dict[str, Any]] = None,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute a single replay with optional overrides.
        replay_overrides: optional dict merged into the request body (e.g. tools, extra params).
        """
        async with self.semaphore:
            # 1. Prepare Payload
            raw = snapshot.payload
            # Proxy-created snapshots store { "request": {...}, "response": {...} }; use request as body
            if isinstance(raw, dict) and "request" in raw and "response" in raw:
                payload = dict(raw["request"]) if isinstance(raw.get("request"), dict) else dict(raw)
            else:
                payload = dict(raw) if isinstance(raw, dict) else {}
            if new_model:
                payload["model"] = new_model
            if temperature is not None:
                payload["temperature"] = temperature
            if max_tokens is not None:
                payload["max_tokens"] = max_tokens
            if top_p is not None:
                payload["top_p"] = top_p
            if isinstance(replay_overrides, dict) and replay_overrides:
                for k, v in replay_overrides.items():
                    if v is None:
                        payload.pop(k, None)  # null in overrides = remove key from request
                    else:
                        payload[k] = v

            if new_system_prompt:
                # Find system message and replace
                messages = payload.get("messages", [])
                for msg in messages:
                    if msg.get("role") == "system":
                        msg["content"] = new_system_prompt
                        break
                else:
                    # If no system prompt found, prepend it
                    messages.insert(0, {"role": "system", "content": new_system_prompt})
                payload["messages"] = messages

            if not payload.get("messages"):
                return {
                    "snapshot_id": snapshot.id,
                    "success": False,
                    "error": "Replay payload has no messages; cannot send to provider.",
                }

            # 2. Build URL
            provider = snapshot.provider
            base_url = PROVIDER_URLS.get(provider)
            model_for_url = payload.get("model") or snapshot.model or "unknown"
            endpoint = "/chat/completions" if provider != "google" else f"/models/{model_for_url}:generateContent"
            target_url = f"{base_url}{endpoint}"

            # 3. Headers
            # Use provided API key or fallback to environment
            final_key = api_key or getattr(settings, f"{provider.upper()}_API_KEY", None)
            if not final_key or (isinstance(final_key, str) and not final_key.strip()):
                return {
                    "snapshot_id": snapshot.id,
                    "success": False,
                    "error": f"Replay requires an API key for provider '{provider}'. Set replay api_key in the request or {provider.upper()}_API_KEY in environment.",
                }
            headers = {"Content-Type": "application/json"}
            if provider == "openai":
                headers["Authorization"] = f"Bearer {final_key}"
            elif provider == "anthropic":
                headers["x-api-key"] = final_key
                headers["anthropic-version"] = "2023-06-01"
            elif provider == "google":
                headers["x-goog-api-key"] = final_key

            # 4. Execute
            start_time = asyncio.get_event_loop().time()
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(target_url, headers=headers, json=payload)
                    duration_ms = (asyncio.get_event_loop().time() - start_time) * 1000
                    
                    return {
                        "snapshot_id": snapshot.id,
                        "original_model": snapshot.model,
                        "replay_model": payload.get("model"),
                        "status_code": response.status_code,
                        "response_data": response.json() if response.status_code == 200 else response.text,
                        "latency_ms": duration_ms,
                        "success": response.status_code == 200
                    }
            except Exception as e:
                logger.error(f"Replay failed for snapshot {snapshot.id}: {str(e)}")
                return {
                    "snapshot_id": snapshot.id,
                    "success": False,
                    "error": str(e)
                }

    async def run_batch_replay(
        self,
        snapshots: List[Snapshot],
        new_model: Optional[str] = None,
        new_system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        replay_overrides: Optional[Dict[str, Any]] = None,
        api_key: Optional[str] = None,
        rubric: Optional[EvaluationRubric] = None,
        judge_model: str = "gpt-4o-mini",
        project_id: Optional[int] = None,
        db: Optional[Session] = None,
        replay_run: Optional[ReplayRun] = None,
    ) -> List[Dict[str, Any]]:
        """Run multiple replays in parallel, evaluate, and apply signals."""
        results = await asyncio.gather(
            *[
                self.replay_snapshot(
                    s,
                    new_model=new_model,
                    new_system_prompt=new_system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    top_p=top_p,
                    replay_overrides=replay_overrides,
                    api_key=api_key,
                )
                for s in snapshots
            ]
        )

        normalizer = DataNormalizer()

        if rubric:
            from app.services.judge_service import judge_service
            
            for res in results:
                if res["success"]:
                    # 1. Extract texts
                    snapshot = next(s for s in snapshots if s.id == res["snapshot_id"])
                    
                    # We need the original response text. 
                    # For MVP, we extract it from the snapshot metadata or associated APICall.
                    # Since Snapshot doesn't store response_text directly, we normalize the replayed response.
                    replayed_text = normalizer._extract_response_text(res["response_data"])
                    
                    # Original text extraction (from associated APICall)
                    from app.core.database import SessionLocal
                    with SessionLocal() as db:
                        from app.models.api_call import APICall
                        api_call = db.query(APICall).filter(APICall.chain_id == snapshot.trace_id).first()
                        original_text = api_call.response_text if api_call else "Original not found"

                    # 2. Judge
                    if original_text and replayed_text:
                        # Track judge call usage for subscription limits
                        # Get project owner from snapshot's trace
                        from app.core.database import SessionLocal
                        judge_db = db or SessionLocal()
                        user_api_key = None
                        try:
                            from app.models.project import Project
                            from app.models.trace import Trace
                            from app.services.billing_service import BillingService
                            from app.services.user_api_key_service import UserApiKeyService
                            
                            trace = judge_db.query(Trace).filter(Trace.id == snapshot.trace_id).first()
                            if trace:
                                project = judge_db.query(Project).filter(Project.id == (project_id or trace.project_id)).first()
                                if project:
                                    # Get user API key for Judge if available
                                    user_api_key_service = UserApiKeyService(judge_db)
                                    user_api_key = user_api_key_service.get_user_api_key(project.id, "openai")
                                    
                                    billing_service = BillingService(judge_db)
                                    # Check limit before calling judge
                                    is_allowed, warning = billing_service.increment_usage(
                                        project.owner_id, "judge_calls", 1
                                    )
                                    if not is_allowed:
                                        res["judge_evaluation"] = {
                                            "error": "Judge call limit exceeded. Please upgrade your plan.",
                                            "limit_warning": warning
                                        }
                                        continue
                        except Exception as e:
                            logger.warning(f"Failed to track judge call usage: {str(e)}")
                        
                        evaluation = await judge_service.evaluate_response(
                            original_output=original_text,
                            replayed_output=replayed_text,
                            rubric=rubric,
                            judge_model=judge_model,
                            user_api_key=user_api_key  # Use user API key if available
                        )
                        res["judge_evaluation"] = evaluation

        # SignalEngine integration, Worst marking, Alerts & HITL Reviews (when DB/session is provided)
        if db and project_id:
            signal_service = SignalDetectionService(db)
            review_service = ReviewService(db)
            review_items: List[Dict[str, Any]] = []
            for res in results:
                if not res.get("success"):
                    continue
                snapshot = next((s for s in snapshots if s.id == res["snapshot_id"]), None)
                if not snapshot:
                    continue

                try:
                    response_text = normalizer._extract_response_text(res.get("response_data"))
                except Exception:
                    response_text = ""

                signal_result = signal_service.detect_all_signals(
                    project_id=project_id,
                    response_text=response_text or "",
                    request_data=None,
                    response_data={
                        "latency_ms": res.get("latency_ms"),
                        "tokens_used": None,
                        "cost": None,
                    },
                    baseline_data=None,
                    snapshot_id=snapshot.id,
                )

                snapshot.signal_result = signal_result

                # When a snapshot transitions from non-worst to worst, persist flags and enqueue an Alert
                became_worst = bool(signal_result.get("is_worst")) and not bool(
                    getattr(snapshot, "is_worst", False)
                )
                if became_worst:
                    snapshot.is_worst = True
                    snapshot.worst_status = signal_result.get("worst_status") or "unreviewed"

                    # Create a worst-case alert scoped to Live View snapshots
                    try:
                        alert = Alert(
                            project_id=project_id,
                            alert_type="worst_case",
                            severity="high",
                            title="New worst case detected (Live View)",
                            message=(
                                f"Agent '{snapshot.agent_id}' has a new worst snapshot "
                                f"(status={snapshot.worst_status or 'unreviewed'})."
                            ),
                            alert_data={
                                "source": "replay",
                                "target": "live_view",
                                "project_id": project_id,
                                "agent_id": snapshot.agent_id,
                                "worst_status": snapshot.worst_status,
                                "snapshot_id": snapshot.id,
                            },
                        )
                        db.add(alert)
                    except Exception:
                        # Alerts should never break replay flow; log is handled by global logging config
                        pass

                res["signal_result"] = signal_result

                # Collect cases that require human review:
                # - Explicit SignalEngine verdict: needs_review / critical
                # - Or newly marked worst snapshot
                status = signal_result.get("status")
                if status in ("needs_review", "critical") or became_worst:
                    review_items.append(
                        {
                            "snapshot_id": snapshot.id,
                            "prompt": getattr(snapshot, "user_message", None) or "",
                            "response_after": response_text or "",
                            "signal_result": signal_result,
                        }
                    )

            # Auto-create a Review when any snapshots need human attention
            if review_items:
                try:
                    review_service.create_review_from_signal(
                        project_id=project_id,
                        origin="replay",
                        title="Replay results requiring review",
                        description=(
                            f"{len(review_items)} replayed snapshot(s) have signals "
                            "that require human review."
                        ),
                        items=review_items,
                    )
                except Exception:
                    # Review creation should never break replay flow; errors are logged globally
                    pass

            # Update ReplayRun aggregates if provided
            if replay_run is not None:
                safe_count = sum(
                    1
                    for r in results
                    if r.get("signal_result", {}).get("status") == "safe"
                )
                needs_review_count = sum(
                    1
                    for r in results
                    if r.get("signal_result", {}).get("status") == "needs_review"
                )
                critical_count = sum(
                    1
                    for r in results
                    if r.get("signal_result", {}).get("status") == "critical"
                )
                replay_run.safe_count = safe_count
                replay_run.needs_review_count = needs_review_count
                replay_run.critical_count = critical_count
                replay_run.snapshot_count = len(snapshots)
                replay_run.status = "completed"
                db.add(replay_run)

            db.commit()

        return results

# Global instance
replay_service = ReplayService()
