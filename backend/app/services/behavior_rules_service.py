from __future__ import annotations

from typing import Any, Dict, List, Tuple, Optional

from app.models.behavior_rule import BehaviorRule
from app.utils.tool_calls import normalize_tool_name


def _match_rule_scope(rule: BehaviorRule, steps: List[Dict[str, Any]]) -> bool:
    if rule.scope_type == "project":
        return True
    if rule.scope_type == "agent" and rule.scope_ref:
        return any(str(s.get("agent_id") or "") == str(rule.scope_ref) for s in steps)
    # Canvas scope is currently only meaningful in run metadata; include for forward compatibility.
    return True


def _normalize_rule_name(name: Optional[str]) -> str:
    return str(name or "").strip().lower()


def _rule_type(rule: BehaviorRule) -> str:
    rule_json = rule.rule_json or {}
    return str(rule_json.get("type") or "").strip().lower()


def resolve_effective_rules(
    rules: List[BehaviorRule],
    steps: List[Dict[str, Any]],
) -> Tuple[List[BehaviorRule], Dict[str, Any]]:
    """
    Resolve effective policy rules for a specific validation target.

    Priority:
    - Project defaults always apply unless overridden.
    - Agent-scoped rules apply when the target contains that agent_id.
    - Agent overrides can shadow project defaults via rule_json.meta.override_mode:
      - additive (default): no shadowing
      - replace_same_name: replace project rules with same name+type
      - replace_same_type: replace all project rules of same type
    - Optional explicit shadowing:
      - rule_json.meta.override_project_rule_ids: [rule_id, ...]
      - rule_json.meta.override_project_rule_names: [rule_name, ...]
    """
    scoped_rules = [r for r in rules if r.enabled and _match_rule_scope(r, steps)]
    project_rules = [r for r in scoped_rules if str(r.scope_type or "project") == "project"]
    agent_rules = [r for r in scoped_rules if str(r.scope_type or "") == "agent"]
    other_rules = [r for r in scoped_rules if str(r.scope_type or "") not in {"project", "agent"}]

    remaining_project_rules = list(project_rules)
    override_events: List[Dict[str, Any]] = []

    for agent_rule in agent_rules:
        rule_json = agent_rule.rule_json if isinstance(agent_rule.rule_json, dict) else {}
        meta = rule_json.get("meta") if isinstance(rule_json.get("meta"), dict) else {}
        override_mode = str(meta.get("override_mode") or "additive").strip().lower()

        explicit_ids = {str(x) for x in (meta.get("override_project_rule_ids") or [])}
        explicit_names = {_normalize_rule_name(x) for x in (meta.get("override_project_rule_names") or [])}

        removed_ids: List[str] = []
        next_project_rules: List[BehaviorRule] = []
        for project_rule in remaining_project_rules:
            remove = False
            if project_rule.id in explicit_ids:
                remove = True
            if _normalize_rule_name(project_rule.name) in explicit_names and _normalize_rule_name(project_rule.name):
                remove = True

            same_type = _rule_type(project_rule) == _rule_type(agent_rule) and bool(_rule_type(project_rule))
            same_name_and_type = (
                _normalize_rule_name(project_rule.name) == _normalize_rule_name(agent_rule.name)
                and same_type
                and bool(_normalize_rule_name(project_rule.name))
            )

            if override_mode == "replace_same_name" and same_name_and_type:
                remove = True
            elif override_mode == "replace_same_type" and same_type:
                remove = True

            if remove:
                removed_ids.append(project_rule.id)
            else:
                next_project_rules.append(project_rule)

        remaining_project_rules = next_project_rules
        if removed_ids:
            override_events.append(
                {
                    "agent_rule_id": agent_rule.id,
                    "agent_id": agent_rule.scope_ref,
                    "override_mode": override_mode,
                    "shadowed_project_rule_ids": removed_ids,
                }
            )

    effective_rules = remaining_project_rules + agent_rules + other_rules
    resolution = {
        "project_defaults_total": len(project_rules),
        "agent_overrides_total": len(agent_rules),
        "effective_rule_count": len(effective_rules),
        "override_events": override_events,
    }
    return effective_rules, resolution


def _validate_tool_order(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    pairs = (spec or {}).get("must_happen_before") or []
    tool_indices: Dict[str, List[float]] = {}
    for s in steps:
        t = s.get("tool_name")
        if not t:
            continue
        tool_indices.setdefault(str(t), []).append(float(s.get("step_order") or 0))

    for pair in pairs:
        tool = normalize_tool_name(pair.get("tool") or "")
        before_tool = normalize_tool_name(pair.get("before_tool") or "")
        if not tool or not before_tool:
            continue
        a = tool_indices.get(str(tool), [])
        b = tool_indices.get(str(before_tool), [])
        if not a or not b:
            continue
        if min(a) > min(b):
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "high",
                    "step_ref": min(b),
                    "message": f"'{tool}' must occur before '{before_tool}'",
                    "evidence": {"tool": tool, "before_tool": before_tool},
                }
            )
    return violations


def _validate_tool_forbidden(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    forbidden = set(normalize_tool_name(t) for t in ((spec or {}).get("tools") or []))
    if not forbidden:
        return violations
    for s in steps:
        t = s.get("tool_name")
        if t and t in forbidden:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": f"Forbidden tool used: {t}",
                    "evidence": {"tool": t, "args": s.get("tool_args", {})},
                }
            )
    return violations


def _validate_tool_allowlist(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    allowed = set(normalize_tool_name(t) for t in ((spec or {}).get("tools") or []))
    if not allowed:
        return violations
    for s in steps:
        t = s.get("tool_name")
        if not t:
            continue
        if t not in allowed:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "high",
                    "step_ref": s.get("step_order"),
                    "message": f"Tool not in allowlist: {t}",
                    "evidence": {"tool": t, "args": s.get("tool_args", {}), "allowed": sorted(list(allowed))},
                }
            )
    return violations


def _validate_tool_args_schema(rule: BehaviorRule, spec: Dict[str, Any], steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    target_tool = normalize_tool_name((spec or {}).get("tool") or "")
    schema = (spec or {}).get("json_schema") or {}
    required = schema.get("required") or []
    additional_allowed = schema.get("additionalProperties", True)
    properties = schema.get("properties") or {}

    if not target_tool:
        return violations

    reserved_keys = frozenset({"_raw", "_invalid", "_too_large"})

    for s in steps:
        if s.get("tool_name") != target_tool:
            continue
        args = s.get("tool_args") or {}
        if args.get("_too_large") is True:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": "Tool arguments exceeded size limit",
                    "evidence": {"tool": target_tool},
                }
            )
            continue
        if args.get("_invalid") is True:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": "Tool arguments could not be parsed (invalid JSON or non-dict)",
                    "evidence": {
                        "tool": target_tool,
                        "raw": args.get("_raw"),
                    },
                }
            )
            continue
        args_keys = {k for k in args.keys() if k not in reserved_keys}
        missing = [k for k in required if k not in args]
        extras = [k for k in args_keys if k not in properties] if not additional_allowed else []
        if missing or extras:
            violations.append(
                {
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "severity": rule.severity_default or "critical",
                    "step_ref": s.get("step_order"),
                    "message": "Tool args schema validation failed",
                    "evidence": {
                        "tool": target_tool,
                        "missing_fields": missing,
                        "extra_fields": extras,
                        "args": args,
                    },
                }
            )
    return violations


def run_behavior_validation(
    rules: List[BehaviorRule],
    steps: List[Dict[str, Any]],
) -> Tuple[str, Dict[str, Any], List[Dict[str, Any]]]:
    violations: List[Dict[str, Any]] = []

    if any(s.get("_provider_unknown") for s in steps):
        violations.append(
            {
                "rule_id": None,
                "rule_name": None,
                "severity": "critical",
                "step_ref": None,
                "message": "Unknown provider response; cannot validate tool calls",
                "evidence": {},
            }
        )
    if any(s.get("_id_conflict") for s in steps):
        violations.append(
            {
                "rule_id": None,
                "rule_name": None,
                "severity": "critical",
                "step_ref": None,
                "message": "Duplicate tool_call id with conflicting name or arguments",
                "evidence": {},
            }
        )
    if any(
        s.get("step_type") == "tool_call" and (s.get("tool_name") == "" or s.get("_tool_name_empty"))
        for s in steps
    ):
        violations.append(
            {
                "rule_id": None,
                "rule_name": None,
                "severity": "critical",
                "step_ref": None,
                "message": "Tool name empty or invalid",
                "evidence": {},
            }
        )

    for rule in rules:
        if not rule.enabled:
            continue
        if not _match_rule_scope(rule, steps):
            continue
        rule_json = rule.rule_json or {}
        rule_type = rule_json.get("type")
        spec = rule_json.get("spec") or {}

        if rule_type == "tool_order":
            violations.extend(_validate_tool_order(rule, spec, steps))
        elif rule_type == "tool_forbidden":
            violations.extend(_validate_tool_forbidden(rule, spec, steps))
        elif rule_type == "tool_allowlist":
            violations.extend(_validate_tool_allowlist(rule, spec, steps))
        elif rule_type == "tool_args_schema":
            violations.extend(_validate_tool_args_schema(rule, spec, steps))

    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for v in violations:
        sev = str(v.get("severity") or "medium").lower()
        if sev in severity_counts:
            severity_counts[sev] += 1

    status_out = "pass" if len(violations) == 0 else "fail"
    summary = {
        "status": status_out,
        "step_count": len(steps),
        "rule_count": len(rules),
        "violation_count": len(violations),
        "severity_breakdown": severity_counts,
    }
    return status_out, summary, violations
