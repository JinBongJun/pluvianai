"""
HTTP ingest demo for PluvianAI.

Run:
  pip install -r requirements.txt
  copy .env.example .env
  python run_demo.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv


def load_env() -> None:
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)


def require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise SystemExit(f"Set {name} in .env before running this demo.")
    return value


def build_marker() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"HTTP_DEMO_MARKER_{stamp}"


def base_request_payload(marker: str) -> dict[str, Any]:
    return {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant used for ingest smoke tests."},
            {"role": "user", "content": f"{marker} Please summarize the request handling path."},
        ],
    }


def base_response_payload(marker: str) -> dict[str, Any]:
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": f"{marker} This is a synthetic response from the HTTP ingest demo.",
                }
            }
        ]
    }


def build_case_payload(case_name: str, agent_name: str, marker: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "agent_name": agent_name,
        "latency_ms": 420 if case_name == "minimal" else 780,
        "status_code": 200,
        "request_data": base_request_payload(marker),
        "response_data": base_response_payload(marker),
    }

    if case_name in {"tool_events", "extended_context"}:
        call_id = f"call_{marker.lower()}_{case_name}"
        payload["tool_events"] = [
            {
                "kind": "tool_call",
                "name": "search_policy",
                "call_id": call_id,
                "input": {"query": f"{marker} refund policy"},
            },
            {
                "kind": "tool_result",
                "name": "search_policy",
                "call_id": call_id,
                "output": {
                    "matched_docs": 1,
                    "top_document": "refund-policy-v1",
                    "preview": f"{marker} refunds are allowed within 14 days",
                },
                "status": "ok",
            },
        ]

    if case_name == "extended_context":
        request_data = payload["request_data"]
        assert isinstance(request_data, dict)
        request_data["context"] = {"customer_tier": "pro", "locale": "ko-KR"}
        request_data["sources"] = [
            {"title": "Refund Policy", "url": "https://example.com/refund-policy"}
        ]
        request_data["attachments"] = [{"name": "refund-policy.pdf", "type": "pdf"}]
        payload["latency_ms"] = 930

    return payload


def send_case(
    *,
    base_url: str,
    project_id: str,
    api_key: str,
    case_name: str,
    agent_name: str,
    marker: str,
) -> bool:
    url = f"{base_url.rstrip('/')}/api/v1/projects/{project_id}/api-calls"
    payload = build_case_payload(case_name, agent_name, marker)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    print("=" * 72)
    print(f"Case      : {case_name}")
    print(f"Agent     : {agent_name}")
    print(f"Marker    : {marker}")
    print(f"POST      : {url}")

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=20)
    except requests.RequestException as exc:
        print(f"Request failed: {exc}")
        return False

    print(f"HTTP      : {response.status_code}")
    try:
        print(f"Response  : {json.dumps(response.json(), ensure_ascii=False)}")
    except ValueError:
        print(f"Response  : {response.text[:500]}")

    success = response.status_code == 202
    if success:
        print("Result    : accepted; now check Live View for this marker/agent.")
    else:
        print("Result    : unexpected status; inspect payload/auth/project settings.")
    return success


def main() -> None:
    load_env()

    api_key = require_env("PLUVIANAI_API_KEY")
    project_id = require_env("PLUVIANAI_PROJECT_ID")
    base_url = require_env("PLUVIANAI_API_URL")
    agent_name = (os.getenv("AGENT_NAME") or "http-tool-demo").strip()
    scenario = (os.getenv("SCENARIO") or "all").strip().lower()

    scenario_map = {
        "minimal": ["minimal"],
        "tool_events": ["tool_events"],
        "extended_context": ["extended_context"],
        "all": ["minimal", "tool_events", "extended_context"],
    }
    if scenario not in scenario_map:
        raise SystemExit(
            "SCENARIO must be one of: minimal, tool_events, extended_context, all."
        )

    marker_root = build_marker()
    print(f"Running HTTP ingest demo against {base_url.rstrip('/')} (project={project_id})")
    print(f"Agent name base: {agent_name}")
    print(f"Marker root    : {marker_root}")
    print("Tip            : filter Live View by agent name or search for the marker.")

    failures = 0
    for index, case_name in enumerate(scenario_map[scenario], start=1):
        case_marker = f"{marker_root}_{index:02d}_{case_name}"
        case_agent_name = f"{agent_name}-{case_name}"
        ok = send_case(
            base_url=base_url,
            project_id=project_id,
            api_key=api_key,
            case_name=case_name,
            agent_name=case_agent_name,
            marker=case_marker,
        )
        if not ok:
            failures += 1

    print("=" * 72)
    if failures:
        print(f"Completed with {failures} failure(s).")
        sys.exit(1)

    print("All HTTP ingest cases were accepted.")
    print("Next: open Live View, find the agent names above, and inspect snapshot detail/tool timeline.")


if __name__ == "__main__":
    main()
