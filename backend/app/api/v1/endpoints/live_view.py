from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, BackgroundTasks, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc, or_
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
import time
import uuid
import json
import asyncio
import threading
from pydantic import BaseModel, Field
from sqlalchemy.types import JSON
from app.core.logging_config import logger
from app.core.metrics import (
    realtime_stream_connections_active,
    realtime_stream_connections_opened_total,
)

from app.core.database import get_db, SessionLocal
from app.core.security import get_current_user
from app.core.dependencies import get_snapshot_service
from app.core.permissions import check_project_access, ProjectRole
from app.core.usage_limits import check_snapshot_limit, get_limit_status
from app.models.user import User
from app.models.snapshot import Snapshot
from app.models.trajectory_step import TrajectoryStep
from app.models.saved_log import SavedLog
from app.utils.tool_calls import extract_tool_calls_summary
from app.utils.tool_events import normalize_tool_events
from app.utils.secret_redaction import redact_secrets
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.agent_eval_config_history import AgentEvalConfigHistory
from app.models.project import Project
from app.models.user_api_key import UserApiKey
from app.services.cache_service import cache_service
from app.services.live_view_events import publish_agents_changed
from app.domain.live_view_release_gate import (
    build_agent_visibility_context,
    is_agent_hard_deleted,
    is_agent_soft_deleted,
    restore_agent_if_soft_deleted,
)
from app.services.live_eval_service import (
    evaluate_recent_snapshots,
    normalize_eval_config,
    aggregate_stored_eval_checks,
    eval_config_version_hash,
)

router = APIRouter()

EXTENDED_CONTEXT_KEYS = (
    "context",
    "retrieved_chunks",
    "documents",
    "attachments",
    "rag_context",
    "sources",
)

REQUEST_CONTROL_KEYS = (
    "temperature",
    "top_p",
    "max_tokens",
    "tool_choice",
    "response_format",
    "stream",
    "metadata",
    "seed",
    "presence_penalty",
    "frequency_penalty",
    "parallel_tool_calls",
)

EXCLUDED_ADDITIONAL_KEYS = {
    "provider",
    "model",
    "messages",
    "message",
    "user_message",
    "response",
    "responses",
    "input",
    "inputs",
    "system",
    "system_prompt",
    "temperature",
    "top_p",
    "max_tokens",
    "tool_choice",
    "tools",
    "response_format",
    "stream",
    "metadata",
    "trace_id",
    "agent_id",
    "agent_name",
}

def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return str(dt)


def _ensure_project(project_id: int, current_user: User, db: Session) -> Project:
    return check_project_access(project_id, current_user, db)


def _ensure_project_admin(project_id: int, current_user: User, db: Session) -> Project:
    return check_project_access(project_id, current_user, db, required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN])


def _invalidate_live_view_hot_path_cache(project_id: int) -> None:
    if not cache_service.enabled:
        return
    cache_service.delete_pattern(f"project:{project_id}:live_view:agents:*")
    cache_service.delete_pattern(f"project:{project_id}:release_gate:agents:*")


def _publish_agents_changed_with_cache_invalidation(
    project_id: int, agent_ids: Optional[List[str]] = None
) -> None:
    _invalidate_live_view_hot_path_cache(project_id)
    publish_agents_changed(project_id, agent_ids or [])


def _as_object(value: Any) -> Optional[Dict[str, Any]]:
    return value if isinstance(value, dict) else None


def _get_request_object(payload: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None
    request = _as_object(payload.get("request"))
    if request is not None:
        return request
    request_data = _as_object(payload.get("request_data"))
    if request_data is not None:
        return request_data
    return payload


def _maybe_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value.strip())
        except Exception:
            return None
    return None


def _request_overview_from_payload(
    payload: Any,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    request_context_meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None
    request = _get_request_object(payload) or {}
    meta = request_context_meta or _request_context_meta_from_payload(payload) or {}

    def _collect_extended_keys() -> List[str]:
        seen = []
        for source in (payload, request):
            if not isinstance(source, dict):
                continue
            for key in EXTENDED_CONTEXT_KEYS:
                if source.get(key) not in (None, "") and key not in seen:
                    seen.append(key)
        return seen

    def _collect_request_control_keys() -> List[str]:
        return [key for key in REQUEST_CONTROL_KEYS if request.get(key) not in (None, "")]

    def _collect_additional_request_keys() -> List[str]:
        out: List[str] = []
        for key, value in request.items():
            if key in EXCLUDED_ADDITIONAL_KEYS:
                continue
            if key in REQUEST_CONTROL_KEYS or key in EXTENDED_CONTEXT_KEYS:
                continue
            if value in (None, ""):
                continue
            trimmed = str(key or "").strip()
            if trimmed and trimmed not in out:
                out.append(trimmed)
        return out

    messages = request.get("messages")
    tools = request.get("tools")
    resolved_provider = str(provider).strip() if isinstance(provider, str) and provider.strip() else "Not detected"
    if resolved_provider == "Not detected" and isinstance(request.get("provider"), str) and request.get("provider").strip():
        resolved_provider = str(request.get("provider")).strip()
    resolved_model = str(model).strip() if isinstance(model, str) and model.strip() else ""
    if not resolved_model and isinstance(request.get("model"), str) and request.get("model").strip():
        resolved_model = str(request.get("model")).strip()
    if not resolved_model:
        resolved_model = "Not detected"

    omitted_by_policy = bool(meta.get("omitted_by_policy"))
    truncated = bool(meta.get("truncated"))

    return {
        "provider": resolved_provider,
        "model": resolved_model,
        "message_count": len(messages) if isinstance(messages, list) else 0,
        "tools_count": len(tools) if isinstance(tools, list) else 0,
        "temperature": _maybe_number(request.get("temperature")),
        "top_p": _maybe_number(request.get("top_p")),
        "max_tokens": _maybe_number(request.get("max_tokens")),
        "request_control_keys": _collect_request_control_keys(),
        "extended_context_keys": _collect_extended_keys(),
        "additional_request_keys": _collect_additional_request_keys(),
        "omitted_by_policy": omitted_by_policy,
        "truncated": truncated,
        "capture_state": "truncated" if truncated else ("policy_limited" if omitted_by_policy else "complete"),
    }


def _request_context_meta_from_payload(payload: Any) -> Optional[Dict[str, Any]]:
    """Derive UI hints when SDK omitted/truncated bodies (see sdk/python & sdk/node ingest privacy)."""
    if not isinstance(payload, dict):
        return None
    req = payload.get("request")
    if not isinstance(req, dict):
        req = {}
    resp = payload.get("response")
    if not isinstance(resp, dict):
        resp = {}
    msg_omitted = bool(req.get("_pluvianai_message_bodies_omitted"))
    resp_omitted = bool(resp.get("_pluvianai_response_bodies_omitted"))
    trunc_req = bool(req.get("_pluvianai_truncated"))
    trunc_payload = bool(payload.get("_pluvianai_truncated"))
    if not any([msg_omitted, resp_omitted, trunc_req, trunc_payload]):
        return None
    meta: Dict[str, Any] = {}
    if msg_omitted or resp_omitted:
        meta["omitted_by_policy"] = True
    if msg_omitted:
        meta["request_text_omitted"] = True
    if resp_omitted:
        meta["response_text_omitted"] = True
    if trunc_req or trunc_payload:
        meta["truncated"] = True
    if trunc_req:
        meta["request_truncated"] = True
    if trunc_payload:
        meta["payload_truncated"] = True
    return meta


def _tool_timeline_from_payload(payload: Any) -> List[Dict[str, Any]]:
    """Fallback timeline when trajectory_steps not yet materialized (same shape as DB rows)."""
    if not isinstance(payload, dict):
        return []
    evs = normalize_tool_events(payload.get("tool_events"))
    if not evs:
        return []
    out: List[Dict[str, Any]] = []
    for i, ev in enumerate(evs):
        kind = str(ev.get("kind") or "").strip().lower()
        name = ev.get("name")
        row: Dict[str, Any] = {
            "step_order": float(i),
            "step_type": kind,
            "tool_name": name,
            "tool_args": {},
            "tool_result": None,
            "provenance": "payload",
        }
        cid = ev.get("call_id")
        if kind == "tool_call":
            inp = ev.get("input")
            if isinstance(inp, dict):
                args = dict(inp)
            elif inp is not None:
                args = {"input": inp}
            else:
                args = {}
            if cid:
                args["call_id"] = cid
            row["tool_args"] = args
        elif kind in ("tool_result", "action"):
            ta: Dict[str, Any] = {}
            if cid:
                ta["call_id"] = cid
            row["tool_args"] = ta
            tr: Dict[str, Any] = {}
            if ev.get("output") is not None:
                tr["output"] = ev.get("output")
            if ev.get("status"):
                tr["status"] = ev.get("status")
            if cid:
                tr["call_id"] = cid
            if kind == "action" and ev.get("input") is not None:
                tr["input"] = ev.get("input")
            row["tool_result"] = tr if tr else None
        out.append(row)
    return out


def _tool_timeline_for_snapshot(db: Session, project_id: int, snap: Snapshot) -> List[Dict[str, Any]]:
    """Prefer persisted trajectory_steps for this snapshot; else payload.tool_events."""
    tid = snap.trace_id
    sid = str(snap.id)
    if tid:
        q = (
            db.query(TrajectoryStep)
            .filter(
                TrajectoryStep.project_id == project_id,
                TrajectoryStep.trace_id == tid,
                TrajectoryStep.source_id == sid,
            )
            .order_by(TrajectoryStep.step_order.asc())
        )
        rows = q.all()
        toolish = [
            r
            for r in rows
            if str(r.step_type or "") in ("tool_call", "tool_result", "action")
        ]
        if toolish:
            return [
                {
                    "step_order": r.step_order,
                    "step_type": r.step_type,
                    "tool_name": r.tool_name,
                    "tool_args": r.tool_args or {},
                    "tool_result": r.tool_result,
                    "latency_ms": r.latency_ms,
                    "provenance": "trajectory",
                }
                for r in toolish
            ]
    return _tool_timeline_from_payload(snap.payload)


# Bumped when response-time redaction rules change (docs §14.2).
TOOL_TIMELINE_REDACTION_VERSION = 1


def _payload_has_tool_result_event(payload: Any) -> bool:
    """True if payload.tool_events contains a tool_result row (cheap scan; no full normalize)."""
    if not isinstance(payload, dict):
        return False
    raw = payload.get("tool_events")
    if not isinstance(raw, list):
        return False
    for x in raw[:60]:
        if isinstance(x, dict) and str(x.get("kind") or "").strip().lower() == "tool_result":
            return True
    return False


def _batch_snapshot_source_ids_with_tool_result_trajectory(
    db: Session, project_id: int, snapshot_ids: List[int]
) -> set[str]:
    """One query: source_id values (snapshot ids as str) that have a tool_result trajectory row."""
    if not snapshot_ids:
        return set()
    sid_strs = [str(i) for i in snapshot_ids]
    rows = (
        db.query(TrajectoryStep.source_id)
        .filter(
            TrajectoryStep.project_id == project_id,
            TrajectoryStep.step_type == "tool_result",
            TrajectoryStep.source_id.in_(sid_strs),
        )
        .distinct()
        .all()
    )
    return {str(r[0]) for r in rows if r[0] is not None}


class SaveLogsRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Snapshot IDs to save for the selected node.",
    )


class DeleteSavedLogsRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Snapshot IDs to remove from saved logs for the selected node.",
    )


class SnapshotBatchDeleteRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Snapshot IDs to soft-delete.",
    )


class SnapshotBatchActionRequest(BaseModel):
    snapshot_ids: List[int] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Snapshot IDs for batch action.",
    )


class AgentHardDeleteRequest(BaseModel):
    agent_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Agent IDs (system_prompt_hash) to hard-delete for this project.",
    )

@router.get("/projects/{project_id}/live-view/agents")
def list_agents(
    project_id: int,
    limit: int = Query(30, ge=1, le=100),
    include_deleted: bool = Query(False, description="Include soft-deleted agents in the response."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return detected agents (boxes) for Live View by grouping snapshots.
    """
    logger.info(f"LIST_AGENTS: Project={project_id}, User={current_user.id} ({current_user.email})")
    try:
        project = _ensure_project(project_id, current_user, db)

        # Hot-path cache: dashboard polls this endpoint frequently.
        # Short TTL prevents stale UX while dramatically reducing DB load and 429 risk.
        cache_key = f"project:{project_id}:live_view:agents:v2:limit={int(limit)}:include_deleted={int(bool(include_deleted))}"
        if cache_service.enabled:
            cached = cache_service.get(cache_key)
            if isinstance(cached, dict) and "agents" in cached:
                return cached

        # Aggregate snapshots by agent_id (fallback to 'unknown' if missing)
        rows = (
            db.query(
                Snapshot.agent_id,
                Snapshot.model,
                func.count(Snapshot.id).label("total"),
                func.max(Snapshot.created_at).label("last_seen"),
                # Explicitly count worst snapshots using robust SQLAlchemy 2.0 syntax
                func.count(case((Snapshot.is_worst.is_(True), 1), else_=None)).label("worst_count")
            )
            .filter(Snapshot.project_id == project_id, Snapshot.is_deleted.is_(False))
            .group_by(Snapshot.agent_id, Snapshot.model)
            # Use label for ordering to avoid PostgreSQL grouping ambiguity on some versions
            .order_by(desc("last_seen"))
            .limit(limit)
            .all()
        )

        # Build shared visibility context used across Live View and Release Gate.
        agent_ids = [r.agent_id or "unknown" for r in rows]
        visibility = build_agent_visibility_context(
            project_id=project_id,
            db=db,
            seed_agent_ids=agent_ids,
            project=project,
        )
        blueprint_map = visibility.blueprint_map
        sentinel_agents = visibility.sentinel_agents
        has_drift = visibility.has_drift
        settings_map = visibility.settings_map
        rows_by_agent_id = {(r.agent_id or "unknown"): r for r in rows}
        sentinel_by_id = {
            str(node.get("id") or "").strip(): node
            for node in sentinel_agents
            if isinstance(node, dict) and str(node.get("id") or "").strip()
        }
        now_iso = _iso(datetime.now(timezone.utc))

        def serialize(row):
            agent_id = row.agent_id or "unknown"
            setting = settings_map.get(agent_id)
            soft_deleted = is_agent_soft_deleted(settings_map, agent_id)
            return {
                "agent_id": agent_id,
                "display_name": setting.display_name if setting and setting.display_name else (agent_id or "Agent"),
                "model": row.model,
                "system_prompt": "",
                "total": row.total,
                "worst_count": int(row.worst_count or 0),
                "last_seen": _iso(row.last_seen),
                "signals": {},
                "node_type": setting.node_type if setting else "agentCard",
                "is_deleted": soft_deleted,
                "deleted_at": _iso(setting.deleted_at) if setting and soft_deleted else None,
            }

        final_agents = []
        processed_ids = set()

        # 1. Start with Blueprint Nodes (Official)
        for node_id, node in blueprint_map.items():
            if node.get('type') != 'agentCard':
                continue
            soft_deleted = is_agent_soft_deleted(settings_map, node_id)
            hard_deleted = is_agent_hard_deleted(settings_map, node_id)
            if hard_deleted or (soft_deleted and not include_deleted):
                continue

            # Match snapshots
            stat = rows_by_agent_id.get(node_id)
            
            # Match sentinel drift info
            sentinel_node = sentinel_by_id.get(node_id)
            
            final_agents.append({
                "agent_id": node_id,
                "display_name": node.get('data', {}).get('label') or "Official Agent",
                "model": node.get('data', {}).get('model') or (stat.model if stat else "NEURAL_UNIT"),
                "system_prompt": node.get('data', {}).get('system_prompt') or "",
                "total": stat.total if stat else 0,
                "worst_count": int(stat.worst_count or 0) if stat else 0,
                "last_seen": _iso(stat.last_seen) if stat else now_iso,
                "signals": {},
                "node_type": "agentCard",
                "is_official": True,
                "drift_status": "official",
                "is_deleted": soft_deleted,
                "deleted_at": _iso(settings_map.get(node_id).deleted_at)
                if settings_map.get(node_id) and soft_deleted
                else None,
                "position": node.get('position'),
            })
            processed_ids.add(node_id)

        # 2. Add Ghost Nodes (Detected by Sentinel but not in Blueprint)
        for s_node in sentinel_agents:
            s_id = s_node.get("id")
            if s_id in processed_ids:
                continue
            soft_deleted = is_agent_soft_deleted(settings_map, s_id)
            hard_deleted = is_agent_hard_deleted(settings_map, s_id)
            if hard_deleted or (soft_deleted and not include_deleted):
                continue

            stat = rows_by_agent_id.get(s_id)
            
            final_agents.append({
                "agent_id": s_id,
                "display_name": f"Ghost: {s_id}",
                "model": s_node.get("model") or (stat.model if stat else "UNKNOWN"),
                "total": stat.total if stat else 0,
                "worst_count": int(stat.worst_count or 0) if stat else 0,
                "last_seen": _iso(stat.last_seen) if stat else now_iso,
                "signals": {},
                "node_type": "agentCard",
                "is_official": False,
                "drift_status": "ghost",
                "is_ghost": True,
                "is_deleted": soft_deleted,
                "deleted_at": _iso(settings_map.get(s_id).deleted_at)
                if settings_map.get(s_id) and soft_deleted
                else None,
            })
            processed_ids.add(s_id)

        # 3. Add any other detected snapshots (Probabilistic fallback)
        for row in rows:
            if row.agent_id not in processed_ids:
                if is_agent_hard_deleted(settings_map, row.agent_id or "unknown"):
                    continue
                if is_agent_soft_deleted(settings_map, row.agent_id or "unknown") and not include_deleted:
                    continue
                final_agents.append(serialize(row))
                processed_ids.add(row.agent_id or "unknown")

        # 4. Add setting-only nodes (no snapshots, not in blueprint/sentinel)
        for setting_agent_id, setting in settings_map.items():
            if setting_agent_id in processed_ids:
                continue
            if is_agent_hard_deleted(settings_map, setting_agent_id):
                continue
            if setting.is_deleted and not include_deleted:
                continue
            final_agents.append(
                {
                    "agent_id": setting_agent_id,
                    "display_name": setting.display_name or setting_agent_id,
                    "model": "UNKNOWN",
                    "system_prompt": "",
                    "total": 0,
                    "worst_count": 0,
                    "last_seen": None,
                    "signals": {},
                    "node_type": setting.node_type or "agentCard",
                    "is_official": False,
                    "drift_status": "custom",
                    "is_deleted": bool(setting.is_deleted),
                    "deleted_at": _iso(setting.deleted_at),
                }
            )
            processed_ids.add(setting_agent_id)

        payload = {
            "agents": final_agents,
            "has_drift": has_drift,
            "sentinel_online": len(sentinel_agents) > 0
        }
        if cache_service.enabled:
            cache_service.set(cache_key, payload, ttl=20)
        return payload
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"ERROR in list_agents for project {project_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list agents",
        )


@router.get("/projects/{project_id}/live-view/stream")
async def live_view_stream(
    project_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Server-Sent Events stream for Live View dashboards (v0).

    Emits events:
    - agents_changed: { project_id, agent_ids? }
    """
    _ensure_project(project_id, current_user, db)

    # Connection limits (for 1000+ concurrent dashboards).
    MAX_SSE_PER_USER = 3
    MAX_SSE_PER_PROJECT = 300
    PRESENCE_TTL_SEC = 120  # must exceed heartbeat and typical transient disconnects
    RETRY_AFTER_SEC = 30

    conn_id = str(uuid.uuid4())
    user_id = str(getattr(current_user, "id", "") or "")

    def _zset_key_project(pid: int) -> str:
        return f"sse:live_view:project:{int(pid)}"

    def _zset_key_user(uid: str) -> str:
        return f"sse:live_view:user:{uid}"

    def _reject(detail: str, scope: str) -> None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "SSE_LIMIT_EXCEEDED",
                "message": detail,
                "details": {
                    "scope": scope,
                    "project_id": int(project_id),
                    "retry_after_sec": RETRY_AFTER_SEC,
                },
            },
            headers={"Retry-After": str(RETRY_AFTER_SEC)},
        )

    # Enforce limits using Redis ZSET presence when available.
    project_zkey = _zset_key_project(project_id)
    user_zkey = _zset_key_user(user_id)
    if cache_service.enabled and user_id:
        try:
            now_ts = time.time()
            pipe = cache_service.redis_client.pipeline()
            # prune stale
            pipe.zremrangebyscore(project_zkey, "-inf", now_ts)
            pipe.zremrangebyscore(user_zkey, "-inf", now_ts)
            pipe.zcard(project_zkey)
            pipe.zcard(user_zkey)
            _ = pipe.execute()
            proj_count = int(_[-2] or 0)
            user_count = int(_[-1] or 0)
            if user_count >= MAX_SSE_PER_USER:
                _reject(f"Too many Live View streams for this user (max={MAX_SSE_PER_USER}).", "user")
            if proj_count >= MAX_SSE_PER_PROJECT:
                _reject(
                    f"Too many Live View streams for this project (max={MAX_SSE_PER_PROJECT}).",
                    "project",
                )
            expire_at = now_ts + PRESENCE_TTL_SEC
            pipe = cache_service.redis_client.pipeline()
            pipe.zadd(project_zkey, {conn_id: expire_at})
            pipe.zadd(user_zkey, {conn_id: expire_at})
            # ensure keys eventually expire even if disconnect cleanup fails
            pipe.expire(project_zkey, PRESENCE_TTL_SEC * 2)
            pipe.expire(user_zkey, PRESENCE_TTL_SEC * 2)
            pipe.execute()
        except HTTPException:
            raise
        except Exception:
            # Fail-open for SSE limits (don't block dashboards on Redis hiccups)
            pass

    async def event_gen():
        # Heartbeat keeps proxies from buffering/closing idle connections.
        heartbeat_sec = 5
        last_heartbeat = asyncio.get_event_loop().time()
        realtime_stream_connections_opened_total.labels(surface="live_view").inc()
        realtime_stream_connections_active.labels(surface="live_view").inc()
        pubsub = None
        stop_flag = threading.Event()
        channel = f"project:{int(project_id)}:live_view:events"

        try:
            # If Redis is unavailable, fall back to heartbeat-only stream.
            if not cache_service.enabled:
                while not await request.is_disconnected():
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat >= heartbeat_sec:
                        last_heartbeat = now
                        yield b": heartbeat\n\n"
                    await asyncio.sleep(1)
                return

            pubsub = cache_service.redis_client.pubsub(ignore_subscribe_messages=True)
            pubsub.subscribe(channel)

            queue: asyncio.Queue[str] = asyncio.Queue(maxsize=200)

            def _worker():
                try:
                    for msg in pubsub.listen():
                        if stop_flag.is_set():
                            break
                        if not msg or msg.get("type") != "message":
                            continue
                        data = msg.get("data")
                        if not data:
                            continue
                        try:
                            # Non-blocking put; drop if queue is full.
                            queue.put_nowait(str(data))
                        except Exception:
                            pass
                except Exception:
                    pass

            t = threading.Thread(target=_worker, daemon=True)
            t.start()

            try:
                # Kick a tiny event so client can mark "connected".
                yield b"event: connected\ndata: {}\n\n"

                while not await request.is_disconnected():
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat >= heartbeat_sec:
                        last_heartbeat = now
                        yield b": heartbeat\n\n"
                        # Refresh presence TTL (best-effort).
                        if cache_service.enabled and user_id:
                            try:
                                now_ts = time.time()
                                expire_at = now_ts + PRESENCE_TTL_SEC
                                pipe = cache_service.redis_client.pipeline()
                                pipe.zadd(project_zkey, {conn_id: expire_at}, xx=True)
                                pipe.zadd(user_zkey, {conn_id: expire_at}, xx=True)
                                pipe.expire(project_zkey, PRESENCE_TTL_SEC * 2)
                                pipe.expire(user_zkey, PRESENCE_TTL_SEC * 2)
                                pipe.execute()
                            except Exception:
                                pass

                    try:
                        raw = await asyncio.wait_for(queue.get(), timeout=1.0)
                    except asyncio.TimeoutError:
                        continue

                    # SSE framing
                    yield f"event: agents_changed\ndata: {raw}\n\n".encode("utf-8")
            finally:
                stop_flag.set()
                # Best-effort remove presence entries.
                if cache_service.enabled and user_id:
                    try:
                        pipe = cache_service.redis_client.pipeline()
                        pipe.zrem(project_zkey, conn_id)
                        pipe.zrem(user_zkey, conn_id)
                        pipe.execute()
                    except Exception:
                        pass
                if pubsub is not None:
                    try:
                        pubsub.unsubscribe(channel)
                        pubsub.close()
                    except Exception:
                        pass
        finally:
            stop_flag.set()
            realtime_stream_connections_active.labels(surface="live_view").dec()
            if cache_service.enabled and user_id:
                try:
                    pipe = cache_service.redis_client.pipeline()
                    pipe.zrem(project_zkey, conn_id)
                    pipe.zrem(user_zkey, conn_id)
                    pipe.execute()
                except Exception:
                    pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # Helps with nginx / some proxies that buffer streaming responses.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/settings")
def get_agent_settings(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t0 = time.perf_counter()
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000
    if elapsed_ms > 1000:
        logger.info(
            "get_agent_settings slow: project_id=%s agent_id=%s elapsed_ms=%.0f",
            project_id, agent_id, elapsed_ms,
        )
    if not setting:
        return {
            "agent_id": agent_id,
            "display_name": None,
            "node_type": "agentCard",
            "is_deleted": False,
            "diagnostic_config": {},
        }
    if not setting.is_deleted and setting.deleted_at is not None:
        return {
            "agent_id": agent_id,
            "display_name": None,
            "node_type": "agentCard",
            "is_deleted": False,
            "diagnostic_config": {},
        }
    return {
        "agent_id": agent_id,
        "display_name": setting.display_name,
        "node_type": setting.node_type,
        "is_deleted": setting.is_deleted,
        "diagnostic_config": setting.diagnostic_config or {},
    }


def _deep_merge_dict(base: dict, incoming: dict) -> dict:
    """
    Deep-merge `incoming` into `base` (dicts only).
    - Nested dicts are merged recursively.
    - Non-dict values in `incoming` replace `base`.
    """
    out = dict(base or {})
    for k, v in (incoming or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge_dict(out[k], v)
        else:
            out[k] = v
    return out


def _csv_has_items(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return any(part.strip() for part in value.split(","))


def _validate_eval_config_for_save(eval_part: Dict[str, Any]) -> None:
    normalized_eval = normalize_eval_config(eval_part)
    required_cfg = normalized_eval.get("required", {})
    if required_cfg.get("enabled"):
        has_required_input = _csv_has_items(required_cfg.get("keywords_csv")) or _csv_has_items(
            required_cfg.get("json_fields_csv")
        )
        if not has_required_input:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="When required is enabled, set keywords_csv or json_fields_csv.",
            )

    format_cfg = normalized_eval.get("format", {})
    if format_cfg.get("enabled") and not _csv_has_items(format_cfg.get("sections_csv")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="When format is enabled, set sections_csv.",
        )

    # Length and repetition use single fail thresholds in MVP (pass/fail contract).


@router.patch("/projects/{project_id}/live-view/agents/{agent_id}/settings")
def update_agent_settings(
    project_id: int,
    agent_id: str,
    display_name: Optional[str] = None,
    node_type: Optional[str] = None,
    is_deleted: Optional[bool] = None,
    diagnostic_config: Any = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    if diagnostic_config is not None and not isinstance(diagnostic_config, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="diagnostic_config must be a JSON object",
        )

    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if setting and not setting.is_deleted and setting.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Agent was permanently deleted and can no longer be modified.",
        )
    if not setting:
        deleted_at = datetime.now(timezone.utc) if is_deleted else None
        setting = AgentDisplaySetting(
            id=str(uuid.uuid4()),
            project_id=project_id,
            system_prompt_hash=agent_id,
            display_name=display_name,
            node_type=node_type or "agentCard",
            is_deleted=is_deleted or False,
            deleted_at=deleted_at,
            diagnostic_config=diagnostic_config or {},
        )
        db.add(setting)
    else:
        if display_name is not None:
            setting.display_name = display_name
        if node_type is not None:
            setting.node_type = node_type
        if is_deleted is not None:
            setting.is_deleted = is_deleted
            setting.deleted_at = datetime.now(timezone.utc) if is_deleted else None
        if diagnostic_config is not None:
            # Deep-merge with existing config to avoid partial updates wiping nested objects.
            current_config = setting.diagnostic_config or {}
            setting.diagnostic_config = _deep_merge_dict(current_config, diagnostic_config)

    # Record eval config in history for both create + update flows.
    # This enables config-at-time evaluation in Clinical Log.
    if diagnostic_config is not None:
        merged = setting.diagnostic_config or {}
        eval_part = merged.get("eval") if isinstance(merged, dict) else None
        if isinstance(eval_part, dict):
            _validate_eval_config_for_save(eval_part)
            normalized_eval = normalize_eval_config(eval_part)
            history_row = AgentEvalConfigHistory(
                project_id=project_id,
                agent_id=agent_id,
                effective_from=datetime.now(timezone.utc),
                eval_config=normalized_eval,
            )
            db.add(history_row)
            
    db.commit()
    db.refresh(setting)
    _publish_agents_changed_with_cache_invalidation(project_id, [agent_id])
    return {
        "agent_id": agent_id, 
        "display_name": setting.display_name, 
        "is_deleted": setting.is_deleted,
        "diagnostic_config": setting.diagnostic_config
    }


@router.delete("/projects/{project_id}/live-view/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if setting:
        setting.is_deleted = True
        setting.deleted_at = datetime.now(timezone.utc)
    else:
        # So list_agents can exclude this agent via settings_map
        setting = AgentDisplaySetting(
            id=str(uuid.uuid4()),
            project_id=project_id,
            system_prompt_hash=agent_id,
            is_deleted=True,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(setting)
    db.commit()
    _publish_agents_changed_with_cache_invalidation(project_id, [agent_id])
    return None


@router.post(
    "/projects/{project_id}/live-view/agents/hard-delete",
    status_code=status.HTTP_200_OK,
)
def hard_delete_agents(
    project_id: int,
    payload: AgentHardDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permanently delete soft-deleted agent display settings for the given project.

    This is a targeted hard-delete that bypasses the scheduled lifecycle cleanup
    for agents selected by the user in the Live View "Deleted Nodes" tray.
    """
    _ensure_project_admin(project_id, current_user, db)

    normalized_ids = [str(a or "").strip() for a in payload.agent_ids]
    normalized_ids = [a for a in normalized_ids if a]
    if not normalized_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid agent_ids provided",
        )

    settings = (
        db.query(AgentDisplaySetting)
        .filter(
            AgentDisplaySetting.project_id == project_id,
            AgentDisplaySetting.system_prompt_hash.in_(normalized_ids),
            AgentDisplaySetting.is_deleted.is_(True),
        )
        .all()
    )
    target_agent_ids = [str(setting.system_prompt_hash).strip() for setting in settings if setting.system_prompt_hash]
    if not target_agent_ids:
        return {
            "ok": True,
            "deleted_agent_settings": 0,
            "deleted_snapshots": 0,
            "deleted_saved_logs": 0,
            "deleted_trajectory_steps": 0,
            "deleted_agent_eval_history": 0,
            "deleted_user_api_keys": 0,
        }

    snapshot_rows = (
        db.query(Snapshot.id)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id.in_(target_agent_ids),
        )
        .all()
    )
    snapshot_ids = [int(row.id) for row in snapshot_rows]
    snapshot_source_ids = [str(snapshot_id) for snapshot_id in snapshot_ids]

    if snapshot_ids:
        deleted_saved_logs = (
            db.query(SavedLog)
            .filter(
                SavedLog.project_id == project_id,
                or_(SavedLog.agent_id.in_(target_agent_ids), SavedLog.snapshot_id.in_(snapshot_ids)),
            )
            .delete(synchronize_session=False)
        )
        deleted_trajectory_steps = (
            db.query(TrajectoryStep)
            .filter(
                TrajectoryStep.project_id == project_id,
                or_(
                    TrajectoryStep.agent_id.in_(target_agent_ids),
                    TrajectoryStep.source_id.in_(snapshot_source_ids),
                ),
            )
            .delete(synchronize_session=False)
        )
    else:
        deleted_saved_logs = (
            db.query(SavedLog)
            .filter(
                SavedLog.project_id == project_id,
                SavedLog.agent_id.in_(target_agent_ids),
            )
            .delete(synchronize_session=False)
        )
        deleted_trajectory_steps = (
            db.query(TrajectoryStep)
            .filter(
                TrajectoryStep.project_id == project_id,
                TrajectoryStep.agent_id.in_(target_agent_ids),
            )
            .delete(synchronize_session=False)
        )

    deleted_agent_eval_history = (
        db.query(AgentEvalConfigHistory)
        .filter(
            AgentEvalConfigHistory.project_id == project_id,
            AgentEvalConfigHistory.agent_id.in_(target_agent_ids),
        )
        .delete(synchronize_session=False)
    )
    deleted_user_api_keys = (
        db.query(UserApiKey)
        .filter(
            UserApiKey.project_id == project_id,
            UserApiKey.agent_id.in_(target_agent_ids),
        )
        .delete(synchronize_session=False)
    )
    deleted_snapshots = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id.in_(target_agent_ids),
        )
        .delete(synchronize_session=False)
    )

    hard_deleted_at = datetime.now(timezone.utc)
    for setting in settings:
        setting.is_deleted = False
        setting.deleted_at = hard_deleted_at

    db.commit()
    _publish_agents_changed_with_cache_invalidation(project_id, target_agent_ids)

    return {
        "ok": True,
        "deleted_agent_settings": len(target_agent_ids),
        "deleted_snapshots": int(deleted_snapshots or 0),
        "deleted_saved_logs": int(deleted_saved_logs or 0),
        "deleted_trajectory_steps": int(deleted_trajectory_steps or 0),
        "deleted_agent_eval_history": int(deleted_agent_eval_history or 0),
        "deleted_user_api_keys": int(deleted_user_api_keys or 0),
    }


@router.post("/projects/{project_id}/live-view/agents/{agent_id}/restore", status_code=status.HTTP_200_OK)
def restore_agent(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if setting is not None and not setting.is_deleted and setting.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Agent was permanently deleted and cannot be restored.",
        )
    restored = restore_agent_if_soft_deleted(db, project_id, agent_id, now=datetime.now(timezone.utc))
    if not restored:
        if setting is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        setting.is_deleted = False
        setting.deleted_at = None
    db.commit()
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    _publish_agents_changed_with_cache_invalidation(project_id, [agent_id])
    return {
        "agent_id": agent_id,
        "display_name": setting.display_name if setting else None,
        "is_deleted": setting.is_deleted if setting else False,
        "diagnostic_config": setting.diagnostic_config if setting else {},
    }


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs")
def list_saved_logs(
    project_id: int,
    agent_id: str,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)

    total = (
        db.query(func.count(SavedLog.id))
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
        )
        .scalar()
        or 0
    )

    rows = (
        db.query(SavedLog, Snapshot)
        .join(Snapshot, Snapshot.id == SavedLog.snapshot_id)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
            Snapshot.project_id == project_id,
            Snapshot.agent_id == agent_id,
            Snapshot.is_deleted.is_(False),
        )
        .order_by(SavedLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for saved, snap in rows:
        items.append(
            {
                "id": saved.id,
                "snapshot_id": snap.id,
                "trace_id": snap.trace_id,
                "agent_id": snap.agent_id,
                "provider": snap.provider,
                "model": snap.model,
                "status_code": snap.status_code,
                "latency_ms": snap.latency_ms,
                "eval_checks_result": getattr(snap, "eval_checks_result", None),
                "snapshot_created_at": snap.created_at.isoformat() if snap.created_at else None,
                "saved_at": saved.created_at.isoformat() if saved.created_at else None,
            }
        )

    return {"items": items, "total": int(total), "limit": limit, "offset": offset}


@router.post("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs")
def save_logs_for_agent(
    project_id: int,
    agent_id: str,
    body: SaveLogsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    requested_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not requested_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="snapshot_ids is required")

    rows = (
        db.query(Snapshot.id, Snapshot.agent_id)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(requested_ids),
            Snapshot.is_deleted.is_(False),
        )
        .all()
    )
    existing_by_id = {int(row.id): str(row.agent_id or "") for row in rows if row.id is not None}
    missing_snapshot_ids = [sid for sid in requested_ids if sid not in existing_by_id]
    mismatched_snapshot_ids = [sid for sid in requested_ids if sid in existing_by_id and existing_by_id[sid] != agent_id]
    valid_snapshot_ids = [sid for sid in requested_ids if sid in existing_by_id and existing_by_id[sid] == agent_id]

    if not valid_snapshot_ids:
        return {
            "ok": True,
            "saved_count": 0,
            "already_saved_count": 0,
            "missing_snapshot_ids": missing_snapshot_ids,
            "mismatched_snapshot_ids": mismatched_snapshot_ids,
        }

    existing_saved_ids = {
        int(row.snapshot_id)
        for row in db.query(SavedLog.snapshot_id)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
            SavedLog.snapshot_id.in_(valid_snapshot_ids),
        )
        .all()
    }
    to_create_ids = [sid for sid in valid_snapshot_ids if sid not in existing_saved_ids]
    for sid in to_create_ids:
        db.add(SavedLog(project_id=project_id, agent_id=agent_id, snapshot_id=sid))
    if to_create_ids:
        db.commit()

    return {
        "ok": True,
        "saved_count": len(to_create_ids),
        "already_saved_count": len(valid_snapshot_ids) - len(to_create_ids),
        "missing_snapshot_ids": missing_snapshot_ids,
        "mismatched_snapshot_ids": mismatched_snapshot_ids,
    }


@router.post("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs/batch-delete")
def delete_saved_logs_batch(
    project_id: int,
    agent_id: str,
    body: DeleteSavedLogsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    target_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not target_ids:
        return {"ok": True, "deleted": 0}

    deleted = (
        db.query(SavedLog)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
            SavedLog.snapshot_id.in_(target_ids),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": int(deleted or 0)}


@router.delete("/projects/{project_id}/live-view/agents/{agent_id}/saved-logs")
def clear_saved_logs(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    deleted = (
        db.query(SavedLog)
        .filter(
            SavedLog.project_id == project_id,
            SavedLog.agent_id == agent_id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": int(deleted or 0)}


def _run_policy_validation_background(project_id: int, trace_id: str) -> None:
    """Run policy (tool use) validation for a trace in background after snapshot save. Fail-silent."""
    import time
    # Brief delay so snapshots written to Redis stream have time to be flushed to DB by stream_processor
    time.sleep(2)
    from app.api.v1.endpoints.behavior import run_behavior_validation_for_trace
    db = SessionLocal()
    try:
        run_behavior_validation_for_trace(project_id, trace_id, db)
    except Exception as e:
        logger.warning("Policy validation after snapshot save failed: %s", e)
    finally:
        db.close()


@router.post("/projects/{project_id}/snapshots")
async def create_snapshot(
    project_id: int,
    background_tasks: BackgroundTasks,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    snapshot_service = Depends(get_snapshot_service),
):
    """
    Manually ingest a snapshot for Live View (Simulation/SDK support).

    Expected payload: {
        "trace_id": str,
        "agent_id": str (optional),
        "provider": str,
        "model": str,
        "payload": { ...LLM payload... },
        "status_code": int (optional, default 200)
    }

    For tool-call visibility (badge and policy checks): include in "payload" either
    a "response" object containing "tool_calls", or a top-level "tool_calls" array.
    Same shape as Proxy (e.g. response.choices[0].message.tool_calls) is supported.

    Responses:
    - 200 OK: Snapshot saved synchronously (no Redis or Redis unavailable). Body: { id, passed, violations }.
    - 202 Accepted: Snapshot queued for processing (Redis stream). Body: { status: "accepted", message: "..." }.
      The snapshot will appear in list/get after the background worker flushes (typically within a few seconds).
    - 500: Save failed (e.g. queue failed, or sync save error).
    """
    project = _ensure_project(project_id, current_user, db)
    allowed, err_msg = check_snapshot_limit(db, project.owner_id, getattr(current_user, "is_superuser", False))
    if not allowed:
        limit_status = get_limit_status(db, project.owner_id, "snapshots")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "SNAPSHOT_PLAN_LIMIT_REACHED",
                "message": err_msg or "You have reached the snapshot limit for your plan for this billing period.",
                "details": {
                    "plan_type": limit_status.get("plan_type"),
                    "metric": limit_status.get("metric"),
                    "current": limit_status.get("current"),
                    "limit": limit_status.get("limit"),
                    "remaining": limit_status.get("remaining"),
                    "reset_at": limit_status.get("reset_at"),
                    "upgrade_path": "/settings/billing",
                },
            },
        )

    trace_id = payload.get("trace_id")
    provider = payload.get("provider", "unknown")
    model = payload.get("model", "unknown")
    snapshot_payload = payload.get("payload", {})
    agent_id = payload.get("agent_id")
    status_code = payload.get("status_code", 200)

    if trace_id:
        snapshot_service.create_trace(project_id=project_id, trace_id=str(trace_id))

    # Use service to save snapshot (which also triggers signal evaluation)
    snapshot = snapshot_service.save_snapshot(
        trace_id=trace_id,
        provider=provider,
        model=model,
        payload=snapshot_payload,
        status_code=status_code,
        project_id=project_id,
    )
    
    if not snapshot:
        # Queued to Redis stream; acknowledge with 202 so clients do not retry
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "status": "accepted",
                "message": "Snapshot queued for processing. It will appear in the list shortly.",
            },
        )

    # Update agent_id if explicitly provided in wrapper
    if agent_id:
        snapshot.agent_id = agent_id
        restore_agent_if_soft_deleted(db, project_id, agent_id, now=datetime.now(timezone.utc))
        db.commit()
        _publish_agents_changed_with_cache_invalidation(project_id, [agent_id])

    # Run policy (tool use) validation asynchronously so Clinical Log shows result without Run check
    if trace_id:
        background_tasks.add_task(_run_policy_validation_background, project_id, trace_id)

    return {
        "id": snapshot.id,
        "passed": snapshot.evaluation_result.get("passed", True) if snapshot.evaluation_result else True,
        "violations": snapshot.evaluation_result.get("violations", []) if snapshot.evaluation_result else []
    }


@router.get("/projects/{project_id}/snapshots")
def list_snapshots(
    project_id: int,
    agent_id: Optional[str] = None,
    is_worst: Optional[bool] = None,
    light: bool = Query(False, description="If true, omit payload and long text fields for faster list loading"),
    limit: int = Query(50, ge=1, le=400),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Snapshot list with filters for Live View.
    Use light=true for list view; open detail with GET /snapshots/{id} for full payload.
    Each item always includes request_context_meta when stored payload has SDK privacy markers
    (derived server-side; safe with light=true since payload may be omitted from the response).
    """
    _ensure_project(project_id, current_user, db)
    query = db.query(Snapshot).filter(Snapshot.project_id == project_id, Snapshot.is_deleted.is_(False))
    if agent_id:
        query = query.filter(Snapshot.agent_id == agent_id)
    if is_worst is not None:
        query = query.filter(Snapshot.is_worst == is_worst)

    total_count = query.count()
    items = query.order_by(Snapshot.created_at.desc()).offset(offset).limit(limit).all()
    traj_tool_result_ids = _batch_snapshot_source_ids_with_tool_result_trajectory(
        db, project_id, [s.id for s in items]
    )

    def _tool_fields(snap, skip_payload: bool = False):
        summary = getattr(snap, "tool_calls_summary", None)
        if summary is None and not skip_payload and getattr(snap, "payload", None):
            summary = extract_tool_calls_summary(snap.payload)
        return {
            "has_tool_calls": bool(summary),
            "tool_calls_summary": summary or [],
        }

    def _item(s):
        has_tool_results = _payload_has_tool_result_event(getattr(s, "payload", None)) or (
            str(s.id) in traj_tool_result_ids
        )
        request_context_meta = _request_context_meta_from_payload(getattr(s, "payload", None))
        base = {
            "id": s.id,
            "trace_id": s.trace_id,
            "agent_id": s.agent_id,
            "provider": s.provider,
            "model": s.model,
            "model_settings": s.model_settings,
            "latency_ms": s.latency_ms,
            "tokens_used": s.tokens_used,
            "cost": s.cost,
            "status_code": s.status_code,
            "is_worst": s.is_worst,
            "worst_status": s.worst_status,
            "is_golden": s.is_golden,
            "signal_result": s.signal_result,
            "evaluation_result": s.evaluation_result,
            "eval_checks_result": getattr(s, "eval_checks_result", None),
            "eval_config_version": getattr(s, "eval_config_version", None),
            "created_at": s.created_at,
            **_tool_fields(s, skip_payload=light),
            "has_tool_results": has_tool_results,
            # Derived from DB payload even when light=true (payload omitted from JSON for bandwidth).
            "request_context_meta": request_context_meta,
            "request_overview": _request_overview_from_payload(
                getattr(s, "payload", None),
                provider=getattr(s, "provider", None),
                model=getattr(s, "model", None),
                request_context_meta=request_context_meta,
            ),
        }
        if light:
            base["system_prompt"] = None
            base["user_message"] = None
            base["response"] = None
            base["request_prompt"] = None
            base["response_text"] = None
            base["payload"] = None
        else:
            base["system_prompt"] = s.system_prompt
            base["user_message"] = s.user_message
            base["response"] = s.response
            base["request_prompt"] = s.user_message
            base["response_text"] = s.response
            base["payload"] = s.payload
        return base

    return {
        "items": [_item(s) for s in items],
        "count": len(items),
        "total_count": int(total_count),
        "limit": limit,
        "offset": offset,
    }


@router.get("/projects/{project_id}/snapshots/{snapshot_id:int}")
def get_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a single snapshot by id with full fields (for detail modal)."""
    _ensure_project(project_id, current_user, db)
    snap = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id == snapshot_id,
            Snapshot.is_deleted.is_(False),
        )
        .first()
    )
    if not snap:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    summary = getattr(snap, "tool_calls_summary", None)
    if summary is None and snap.payload:
        summary = extract_tool_calls_summary(snap.payload)
    tool_timeline = redact_secrets(_tool_timeline_for_snapshot(db, project_id, snap))
    created_at = getattr(snap, "created_at", None)
    request_context_meta = _request_context_meta_from_payload(snap.payload)
    return {
        "id": snap.id,
        "trace_id": snap.trace_id,
        "agent_id": snap.agent_id,
        "provider": snap.provider,
        "model": snap.model,
        "model_settings": snap.model_settings,
        "system_prompt": snap.system_prompt,
        "user_message": snap.user_message,
        "response": snap.response,
        "request_prompt": snap.user_message,
        "response_text": snap.response,
        "latency_ms": snap.latency_ms,
        "tokens_used": snap.tokens_used,
        "cost": snap.cost,
        "status_code": snap.status_code,
        "is_worst": snap.is_worst,
        "worst_status": snap.worst_status,
        "is_golden": snap.is_golden,
        "signal_result": snap.signal_result,
        "evaluation_result": snap.evaluation_result,
        "eval_checks_result": getattr(snap, "eval_checks_result", None),
        "eval_config_version": getattr(snap, "eval_config_version", None),
        "payload": snap.payload,
        "created_at": created_at.isoformat() if created_at else None,
        "has_tool_calls": bool(summary),
        "tool_calls_summary": summary or [],
        "tool_timeline": tool_timeline,
        "tool_timeline_redaction_version": TOOL_TIMELINE_REDACTION_VERSION,
        "request_context_meta": request_context_meta,
        "request_overview": _request_overview_from_payload(
            snap.payload,
            provider=getattr(snap, "provider", None),
            model=getattr(snap, "model", None),
            request_context_meta=request_context_meta,
        ),
    }


@router.get("/projects/{project_id}/snapshots/deleted")
def list_deleted_snapshots(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.is_deleted.is_(True),
            Snapshot.deleted_at.isnot(None),
            Snapshot.deleted_at >= cutoff,
        )
    )
    total_count = query.count()
    items = (
        query.order_by(Snapshot.deleted_at.desc(), Snapshot.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": s.id,
                "trace_id": s.trace_id,
                "agent_id": s.agent_id,
                "model": s.model,
                "status_code": s.status_code,
                "created_at": s.created_at,
                "deleted_at": s.deleted_at,
            }
            for s in items
        ],
        "count": len(items),
        "total_count": int(total_count),
        "limit": limit,
        "offset": offset,
        "window_days": days,
    }


@router.delete("/projects/{project_id}/snapshots/{snapshot_id:int}")
def delete_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id == snapshot_id,
            Snapshot.is_deleted.is_(False),
        )
        .first()
    )
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")

    now_utc = datetime.now(timezone.utc)
    snapshot.is_deleted = True
    snapshot.deleted_at = now_utc
    db.query(SavedLog).filter(
        SavedLog.project_id == project_id,
        SavedLog.snapshot_id == snapshot_id,
    ).delete(synchronize_session=False)
    db.commit()
    if snapshot.agent_id:
        _publish_agents_changed_with_cache_invalidation(project_id, [snapshot.agent_id])
    return {"ok": True, "deleted": 1}


@router.post("/projects/{project_id}/snapshots/batch-delete")
def batch_delete_snapshots(
    project_id: int,
    body: SnapshotBatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not snapshot_ids:
        return {"ok": True, "deleted": 0}

    rows = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(False),
        )
        .all()
    )
    if not rows:
        return {"ok": True, "deleted": 0}

    now_utc = datetime.now(timezone.utc)
    matched_ids = [int(row.id) for row in rows]
    affected_agent_ids = sorted(
        {
            str(row.agent_id).strip()
            for row in rows
            if getattr(row, "agent_id", None) and str(row.agent_id).strip()
        }
    )
    (
        db.query(Snapshot)
        .filter(Snapshot.project_id == project_id, Snapshot.id.in_(matched_ids))
        .update(
            {"is_deleted": True, "deleted_at": now_utc},
            synchronize_session=False,
        )
    )
    (
        db.query(SavedLog)
        .filter(SavedLog.project_id == project_id, SavedLog.snapshot_id.in_(matched_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    if affected_agent_ids:
        _publish_agents_changed_with_cache_invalidation(project_id, affected_agent_ids)
    return {"ok": True, "deleted": len(matched_ids)}


@router.post("/projects/{project_id}/snapshots/{snapshot_id:int}/restore")
def restore_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id == snapshot_id,
            Snapshot.is_deleted.is_(True),
        )
        .first()
    )
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deleted snapshot not found")

    snapshot.is_deleted = False
    snapshot.deleted_at = None
    db.commit()
    if snapshot.agent_id:
        _publish_agents_changed_with_cache_invalidation(project_id, [snapshot.agent_id])
    return {"ok": True, "restored": 1}


@router.post("/projects/{project_id}/snapshots/deleted/batch-restore")
def restore_snapshots_batch(
    project_id: int,
    body: SnapshotBatchActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not snapshot_ids:
        return {"ok": True, "restored": 0}
    rows = (
        db.query(Snapshot.id, Snapshot.agent_id)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(True),
        )
        .all()
    )
    affected_agent_ids = sorted(
        {
            str(row.agent_id).strip()
            for row in rows
            if getattr(row, "agent_id", None) and str(row.agent_id).strip()
        }
    )
    restored = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(True),
        )
        .update({"is_deleted": False, "deleted_at": None}, synchronize_session=False)
    )
    db.commit()
    if affected_agent_ids:
        _publish_agents_changed_with_cache_invalidation(project_id, affected_agent_ids)
    return {"ok": True, "restored": int(restored or 0)}


@router.post("/projects/{project_id}/snapshots/deleted/permanent-delete")
def permanently_delete_snapshots(
    project_id: int,
    body: SnapshotBatchActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project_admin(project_id, current_user, db)
    snapshot_ids = list(dict.fromkeys(int(sid) for sid in body.snapshot_ids if sid is not None))
    if not snapshot_ids:
        return {"ok": True, "deleted": 0}
    rows = (
        db.query(Snapshot.id, Snapshot.agent_id)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(True),
        )
        .all()
    )
    affected_agent_ids = sorted(
        {
            str(row.agent_id).strip()
            for row in rows
            if getattr(row, "agent_id", None) and str(row.agent_id).strip()
        }
    )
    deleted = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.id.in_(snapshot_ids),
            Snapshot.is_deleted.is_(True),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    if affected_agent_ids:
        _publish_agents_changed_with_cache_invalidation(project_id, affected_agent_ids)
    return {"ok": True, "deleted": int(deleted or 0)}


def _parse_created_at(created_at: Any) -> Optional[datetime]:
    """Parse snapshot created_at (ISO string or datetime) to timezone-aware datetime for comparison."""
    if created_at is None:
        return None
    if isinstance(created_at, datetime):
        return created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    if isinstance(created_at, str):
        s = created_at.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/evaluation")
def evaluate_agent_with_eval_config(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate recent snapshots for an agent. Each snapshot is evaluated with the eval config
    that was active at that snapshot's created_at (config-at-time): logs before a config
    change use the old config, logs after use the new one.
    """
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    diagnostic_config = setting.diagnostic_config if setting and isinstance(setting.diagnostic_config, dict) else {}
    current_eval = diagnostic_config.get("eval", {}) if isinstance(diagnostic_config, dict) else {}

    history_rows = (
        db.query(AgentEvalConfigHistory)
        .filter(
            AgentEvalConfigHistory.project_id == project_id,
            AgentEvalConfigHistory.agent_id == agent_id,
        )
        .order_by(AgentEvalConfigHistory.effective_from.desc())
        .all()
    )

    def get_config_at(created_at: Any) -> Dict[str, Any]:
        ts = _parse_created_at(created_at)
        if ts is None:
            return current_eval
        for row in history_rows:
            eff = row.effective_from
            if eff is None:
                continue
            if getattr(eff, "tzinfo", None) is None:
                eff = eff.replace(tzinfo=timezone.utc)
            if eff <= ts:
                return row.eval_config or current_eval
        return current_eval

    # Load recent snapshots; if all have stored eval_checks_result, use them (stable display).
    window_limit = normalize_eval_config(current_eval)["window"]["limit"]
    rows = (
        db.query(Snapshot)
        .filter(
            Snapshot.project_id == project_id,
            Snapshot.agent_id == agent_id,
            Snapshot.is_deleted.is_(False),
        )
        .order_by(Snapshot.created_at.desc())
        .limit(window_limit)
        .all()
    )
    rows.reverse()
    all_have_stored = all(getattr(s, "eval_checks_result", None) for s in rows)
    if rows and all_have_stored:
        out = aggregate_stored_eval_checks(rows, agent_id, current_eval)
    elif not history_rows:
        out = evaluate_recent_snapshots(db, project_id, agent_id, current_eval)
    else:
        out = evaluate_recent_snapshots(db, project_id, agent_id, current_eval, get_config_at=get_config_at)
    out["current_eval_config_version"] = eval_config_version_hash(current_eval)
    return out
