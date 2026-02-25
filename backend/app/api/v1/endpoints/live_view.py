from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import uuid
import json
from sqlalchemy.types import JSON
from app.core.logging_config import logger

from app.core.database import get_db, SessionLocal
from app.core.security import get_current_user
from app.core.dependencies import get_snapshot_service
from app.core.permissions import check_project_access
from app.models.user import User
from app.models.snapshot import Snapshot
from app.utils.tool_calls import extract_tool_calls_summary
from app.models.agent_display_setting import AgentDisplaySetting
from app.models.agent_eval_config_history import AgentEvalConfigHistory
from app.models.project import Project
from app.services.live_eval_service import (
    evaluate_recent_snapshots,
    normalize_eval_config,
    aggregate_stored_eval_checks,
    eval_config_version_hash,
)

router = APIRouter()


def _ensure_project(project_id: int, current_user: User, db: Session) -> Project:
    return check_project_access(project_id, current_user, db)

@router.get("/projects/{project_id}/live-view/agents")
def list_agents(
    project_id: int,
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return detected agents (boxes) for Live View by grouping snapshots.
    """
    logger.info(f"LIST_AGENTS: Project={project_id}, User={current_user.id} ({current_user.email})")
    try:
        _ensure_project(project_id, current_user, db)

        # Aggregate snapshots by agent_id (fallback to 'unknown' if missing)
        rows = (
            db.query(
                Snapshot.agent_id,
                Snapshot.model,
                Snapshot.system_prompt,
                func.count(Snapshot.id).label("total"),
                func.max(Snapshot.created_at).label("last_seen"),
                # Aggregate 12 extreme diagnostic signals
                func.json_agg(func.cast(Snapshot.signal_result, JSON)).label("all_signals"),
                # Explicitly count worst snapshots using robust SQLAlchemy 2.0 syntax
                func.count(case((Snapshot.is_worst.is_(True), 1), else_=None)).label("worst_count")
            )
            .filter(Snapshot.project_id == project_id)
            .group_by(Snapshot.agent_id, Snapshot.model, Snapshot.system_prompt)
            # Use label for ordering to avoid PostgreSQL grouping ambiguity on some versions
            .order_by(desc("last_seen"))
            .limit(limit)
            .all()
        )

        def _aggregate_signals(json_signals_list):
            """Helper to calculate average scores for the 12 factors"""
            if not json_signals_list:
                return {}
            
            agg = {}
            count = 0
            try:
                # json_agg returns a list of dictionaries in PostgreSQL
                signals_list = json_signals_list if isinstance(json_signals_list, list) else []
                if not signals_list and json_signals_list:
                    try:
                        signals_list = json.loads(json_signals_list)
                    except:
                        pass
                
                for sig in signals_list:
                    if not sig: continue
                    count += 1
                    for k, v in sig.items():
                        agg[k] = agg.get(k, 0) + float(v)
                
                if count > 0:
                    return {k: round(v / count, 4) for k, v in agg.items()}
            except:
                pass
            return {}

        # Fetch display settings
        agent_ids = [r.agent_id or "unknown" for r in rows]
        settings = (
            db.query(AgentDisplaySetting)
            .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash.in_(agent_ids))
            .all()
        )
        settings_map = {s.system_prompt_hash: s for s in settings}

        def serialize(row):
            agent_id = row.agent_id or "unknown"
            setting = settings_map.get(agent_id)
            return {
                "agent_id": agent_id,
                "display_name": setting.display_name if setting and setting.display_name else (agent_id or "Agent"),
                "model": row.model,
                "system_prompt": row.system_prompt,
                "total": row.total,
                "worst_count": int(row.worst_count or 0),
                "last_seen": row.last_seen,
                "signals": _aggregate_signals(row.all_signals),
                "node_type": setting.node_type if setting else "agentCard",
                "is_deleted": setting.is_deleted if setting else False,
            }

        # Integrate Sentinel Data (Real-time Drift Analysis)
        sentinel_agents = []
        has_drift = False
        
        from app.services.cache_service import cache_service
        if cache_service.enabled:
            report_key = f"project:{project_id}:sentinel:latest"
            cached_report = cache_service.redis_client.get(report_key)
            if cached_report:
                report_data = json.loads(cached_report)
                sentinel_agents = report_data.get("nodes", [])
                has_drift = report_data.get("has_drift", False)

        project = _ensure_project(project_id, current_user, db)
        blueprint_nodes = project.canvas_nodes or []
        blueprint_map = {n.get("id"): n for n in blueprint_nodes if n.get("id")}
        
        final_agents = []
        processed_ids = set()

        # 1. Start with Blueprint Nodes (Official)
        for node_id, node in blueprint_map.items():
            if node.get('type') != 'agentCard':
                continue
            
            # Match snapshots
            stat = next((r for r in rows if r.agent_id == node_id), None)
            
            # Match sentinel drift info
            sentinel_node = next((n for n in sentinel_agents if n.get("id") == node_id), None)
            
            final_agents.append({
                "agent_id": node_id,
                "display_name": node.get('data', {}).get('label') or "Official Agent",
                "model": node.get('data', {}).get('model') or (stat.model if stat else "NEURAL_UNIT"),
                "system_prompt": node.get('data', {}).get('system_prompt') or (stat.system_prompt if stat else ""),
                "total": stat.total if stat else 0,
                "worst_count": int(stat.worst_count or 0) if stat else 0,
                "last_seen": stat.last_seen if stat else datetime.now(),
                "signals": _aggregate_signals(stat.all_signals) if stat else {},
                "node_type": "agentCard",
                "is_official": True,
                "drift_status": "official",
                "position": node.get('position'),
            })
            processed_ids.add(node_id)

        # 2. Add Ghost Nodes (Detected by Sentinel but not in Blueprint)
        for s_node in sentinel_agents:
            s_id = s_node.get("id")
            if s_id in processed_ids:
                continue
            
            stat = next((r for r in rows if r.agent_id == s_id), None)
            
            final_agents.append({
                "agent_id": s_id,
                "display_name": f"Ghost: {s_id}",
                "model": s_node.get("model") or (stat.model if stat else "UNKNOWN"),
                "total": stat.total if stat else 0,
                "worst_count": int(stat.worst_count or 0) if stat else 0,
                "last_seen": stat.last_seen if stat else datetime.now(),
                "signals": _aggregate_signals(stat.all_signals) if stat else {},
                "node_type": "agentCard",
                "is_official": False,
                "drift_status": "ghost",
                "is_ghost": True,
            })
            processed_ids.add(s_id)

        # 3. Add any other detected snapshots (Probabilistic fallback)
        for row in rows:
            if row.agent_id not in processed_ids:
                final_agents.append(serialize(row))

        return {
            "agents": final_agents,
            "has_drift": has_drift,
            "sentinel_online": len(sentinel_agents) > 0
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"ERROR in list_agents for project {project_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list agents: {str(e)}",
        )


@router.get("/projects/{project_id}/live-view/agents/{agent_id}/settings")
def get_agent_settings(
    project_id: int,
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if not setting:
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
    _ensure_project(project_id, current_user, db)
    if diagnostic_config is not None and not isinstance(diagnostic_config, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="diagnostic_config must be a JSON object",
        )

    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if not setting:
        setting = AgentDisplaySetting(
            id=str(uuid.uuid4()),
            project_id=project_id,
            system_prompt_hash=agent_id,
            display_name=display_name,
            node_type=node_type or "agentCard",
            is_deleted=is_deleted or False,
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
    _ensure_project(project_id, current_user, db)
    setting = (
        db.query(AgentDisplaySetting)
        .filter(AgentDisplaySetting.project_id == project_id, AgentDisplaySetting.system_prompt_hash == agent_id)
        .first()
    )
    if setting:
        setting.is_deleted = True
        db.commit()
    return None


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
    """
    _ensure_project(project_id, current_user, db)
    
    trace_id = payload.get("trace_id")
    provider = payload.get("provider", "unknown")
    model = payload.get("model", "unknown")
    snapshot_payload = payload.get("payload", {})
    agent_id = payload.get("agent_id")
    status_code = payload.get("status_code", 200)

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
        raise HTTPException(status_code=500, detail="Failed to save snapshot")
    
    # Update agent_id if explicitly provided in wrapper
    if agent_id:
        snapshot.agent_id = agent_id
        db.commit()

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
    limit: int = Query(50, ge=1, le=400),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Snapshot list with filters for Live View.
    """
    _ensure_project(project_id, current_user, db)
    query = db.query(Snapshot).filter(Snapshot.project_id == project_id)
    if agent_id:
        query = query.filter(Snapshot.agent_id == agent_id)
    if is_worst is not None:
        query = query.filter(Snapshot.is_worst == is_worst)

    items = (
        query.order_by(Snapshot.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    def _tool_fields(snap):
        summary = getattr(snap, "tool_calls_summary", None)
        if summary is None and snap.payload:
            summary = extract_tool_calls_summary(snap.payload)
        return {
            "has_tool_calls": bool(summary),
            "tool_calls_summary": summary or [],
        }

    return {
        "items": [
            {
                "id": s.id,
                "trace_id": s.trace_id,
                "agent_id": s.agent_id,
                "provider": s.provider,
                "model": s.model,
                "model_settings": s.model_settings,
                "system_prompt": s.system_prompt,
                "user_message": s.user_message,
                "response": s.response,
                "request_prompt": s.user_message,
                "response_text": s.response,
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
                "payload": s.payload,
                "created_at": s.created_at,
                **_tool_fields(s),
            }
            for s in items
        ],
        "count": len(items),
        "limit": limit,
        "offset": offset,
    }


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
        .filter(Snapshot.project_id == project_id, Snapshot.agent_id == agent_id)
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
