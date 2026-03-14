#!/usr/bin/env python3
"""
Release Gate repeat matrix verifier for RG-2 / RG-3.

What this script validates:
1) repeat_runs matrix works for 1/10/50/100.
2) Case status mapping is consistent with attempts:
   - PASS: passed_attempts == N
   - FAIL: passed_attempts == 0
   - FLAKY: 0 < passed_attempts < N
3) repeat_runs=1 never returns FLAKY.
4) Aggregate fail_rate/flaky_rate matches case-level counts.
5) Export JSON includes release_gate summary with repeat_runs and totals.

Usage examples:
  # Existing account + existing project/agent
  AGENTGUARD_TEST_EMAIL=owner@example.com ^
  AGENTGUARD_TEST_PASSWORD='StrongPassword123!' ^
  python scripts/release_gate_repeat_matrix_test.py --project-id 18 --agent-id agent-A

  # Auto-register temp user and auto-create org/project
  python scripts/release_gate_repeat_matrix_test.py --auto-register
"""

from __future__ import annotations

import argparse
import json
import math
import os
import secrets
import sys
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

import httpx


API_PREFIX = "/api/v1"


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def info(msg: str) -> None:
    print(f"{Colors.BLUE}[INFO]{Colors.RESET} {msg}")


def success(msg: str) -> None:
    print(f"{Colors.GREEN}[OK]{Colors.RESET} {msg}")


def warn(msg: str) -> None:
    print(f"{Colors.YELLOW}[WARN]{Colors.RESET} {msg}")


def fail(msg: str) -> None:
    print(f"{Colors.RED}[FAIL]{Colors.RESET} {msg}")


def unwrap(data: Any) -> Any:
    if isinstance(data, dict) and "data" in data:
        return data["data"]
    return data


class ScriptError(RuntimeError):
    pass


@dataclass
class RunCheckResult:
    repeat_runs: int
    job_id: str
    report_id: Optional[str]
    total_inputs: int
    pass_cases: int
    fail_cases: int
    flaky_cases: int
    fail_rate: float
    flaky_rate: float
    elapsed_seconds: float


class ReleaseGateRepeatMatrixVerifier:
    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        self.client = httpx.Client(base_url=base_url, timeout=timeout_seconds)
        self.access_token: Optional[str] = None

    def close(self) -> None:
        self.client.close()

    def _headers(self) -> Dict[str, str]:
        if not self.access_token:
            raise ScriptError("Not authenticated yet.")
        return {"Authorization": f"Bearer {self.access_token}"}

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        res = self.client.request(method, path, **kwargs)
        return res

    def register(self, email: str, password: str) -> None:
        res = self._request(
            "POST",
            f"{API_PREFIX}/auth/register",
            json={
                "email": email,
                "password": password,
                "full_name": "RG Repeat Matrix User",
                "liability_agreement_accepted": True,
            },
        )
        if res.status_code in (200, 201):
            return
        # Existing user is okay for re-runs.
        body_text = res.text.lower()
        if res.status_code == 400 and "already" in body_text:
            return
        raise ScriptError(f"Register failed ({res.status_code}): {res.text}")

    def login(self, email: str, password: str) -> None:
        res = self._request(
            "POST",
            f"{API_PREFIX}/auth/login",
            data={"username": email, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if res.status_code != 200:
            raise ScriptError(f"Login failed ({res.status_code}): {res.text}")
        payload = unwrap(res.json())
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if not token:
            raise ScriptError("Login response missing access_token.")
        self.access_token = str(token)

    def list_projects(self) -> List[Dict[str, Any]]:
        res = self._request("GET", f"{API_PREFIX}/projects", headers=self._headers())
        if res.status_code != 200:
            raise ScriptError(f"List projects failed ({res.status_code}): {res.text}")
        data = unwrap(res.json())
        return [p for p in data if isinstance(p, dict)] if isinstance(data, list) else []

    def list_orgs(self) -> List[Dict[str, Any]]:
        res = self._request("GET", f"{API_PREFIX}/organizations", headers=self._headers())
        if res.status_code != 200:
            raise ScriptError(f"List organizations failed ({res.status_code}): {res.text}")
        data = unwrap(res.json())
        return [o for o in data if isinstance(o, dict)] if isinstance(data, list) else []

    def create_org(self, name: str) -> int:
        res = self._request(
            "POST",
            f"{API_PREFIX}/organizations",
            headers=self._headers(),
            json={"name": name},
        )
        if res.status_code not in (200, 201):
            raise ScriptError(f"Create organization failed ({res.status_code}): {res.text}")
        data = unwrap(res.json())
        org_id = data.get("id") if isinstance(data, dict) else None
        if not org_id:
            raise ScriptError("Create organization response missing id.")
        return int(org_id)

    def create_project(self, org_id: int, name: str) -> int:
        res = self._request(
            "POST",
            f"{API_PREFIX}/projects",
            headers=self._headers(),
            json={"name": name, "organization_id": org_id},
        )
        if res.status_code not in (200, 201):
            raise ScriptError(f"Create project failed ({res.status_code}): {res.text}")
        data = unwrap(res.json())
        project_id = data.get("id") if isinstance(data, dict) else None
        if not project_id:
            raise ScriptError("Create project response missing id.")
        return int(project_id)

    def ensure_project(self, project_id: Optional[int], org_name: str, project_name: str) -> int:
        if project_id:
            return int(project_id)
        projects = self.list_projects()
        if projects:
            return int(projects[0]["id"])

        orgs = self.list_orgs()
        if orgs:
            org_id = int(orgs[0]["id"])
        else:
            org_id = self.create_org(org_name)
        return self.create_project(org_id, project_name)

    def send_api_call(self, project_id: int, agent_id: str, idx: int) -> None:
        payload = {
            "project_id": project_id,
            "request_data": {
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": f"RG matrix seed message #{idx}"}],
            },
            "response_data": {
                "model": "gpt-4o-mini",
                "choices": [{"message": {"content": f"RG matrix seed response #{idx}"}}],
                "usage": {"total_tokens": 32},
            },
            "latency_ms": 150 + idx,
            "status_code": 200,
            "agent_name": agent_id,
            "chain_id": f"rg-matrix-{secrets.token_hex(4)}-{idx}",
        }
        res = self._request(
            "POST", f"{API_PREFIX}/api-calls", headers=self._headers(), json=payload
        )
        if res.status_code != 202:
            raise ScriptError(f"Seed api-call failed ({res.status_code}): {res.text}")

    def list_recent_snapshots(self, project_id: int, agent_id: str, limit: int = 120) -> List[Dict[str, Any]]:
        res = self._request(
            "GET",
            f"{API_PREFIX}/projects/{project_id}/release-gate/agents/{agent_id}/recent-snapshots",
            headers=self._headers(),
            params={"limit": limit},
        )
        if res.status_code != 200:
            raise ScriptError(f"Recent snapshots failed ({res.status_code}): {res.text}")
        payload = res.json()
        items = payload.get("items", []) if isinstance(payload, dict) else []
        return [x for x in items if isinstance(x, dict)]

    def wait_for_recent_snapshots(
        self, project_id: int, agent_id: str, min_count: int, timeout_seconds: int
    ) -> List[Dict[str, Any]]:
        deadline = time.time() + timeout_seconds
        last_count = 0
        while time.time() < deadline:
            items = self.list_recent_snapshots(project_id, agent_id)
            last_count = len(items)
            if last_count >= min_count:
                return items
            time.sleep(1.0)
        raise ScriptError(
            f"Timed out waiting for >= {min_count} snapshots for agent '{agent_id}'. Last count={last_count}."
        )

    def submit_validate_async(self, project_id: int, payload: Dict[str, Any]) -> str:
        res = self._request(
            "POST",
            f"{API_PREFIX}/projects/{project_id}/release-gate/validate-async",
            headers=self._headers(),
            json=payload,
        )
        if res.status_code != 202:
            raise ScriptError(f"validate-async failed ({res.status_code}): {res.text}")
        data = res.json()
        job = data.get("job", {}) if isinstance(data, dict) else {}
        job_id = job.get("id")
        if not job_id:
            raise ScriptError("validate-async response missing job.id.")
        return str(job_id)

    def poll_job(
        self,
        project_id: int,
        job_id: str,
        timeout_seconds: int,
        interval_seconds: float,
    ) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            res = self._request(
                "GET",
                f"{API_PREFIX}/projects/{project_id}/release-gate/jobs/{job_id}",
                headers=self._headers(),
                params={"include_result": 1},
            )
            if res.status_code != 200:
                raise ScriptError(f"Poll job failed ({res.status_code}): {res.text}")
            payload = res.json() if isinstance(res.json(), dict) else {}
            job = payload.get("job", {}) if isinstance(payload, dict) else {}
            status = str(job.get("status", "")).lower()
            if status in {"succeeded", "failed", "canceled"}:
                result = payload.get("result")
                return job, result if isinstance(result, dict) else None
            time.sleep(interval_seconds)
        raise ScriptError(f"Timed out waiting for job {job_id}.")

    @staticmethod
    def _extract_case_results(result: Dict[str, Any]) -> List[Dict[str, Any]]:
        rows = result.get("run_results")
        if isinstance(rows, list):
            return [x for x in rows if isinstance(x, dict)]
        rows = result.get("case_results")
        if isinstance(rows, list):
            return [x for x in rows if isinstance(x, dict)]
        return []

    @staticmethod
    def _case_status(row: Dict[str, Any]) -> str:
        status = str(row.get("case_status", "")).strip().lower()
        if status in {"pass", "fail", "flaky"}:
            return status
        return "pass" if bool(row.get("pass")) else "fail"

    def _validate_result(
        self,
        result: Dict[str, Any],
        expected_repeat: int,
        expected_total_inputs: int,
    ) -> Tuple[int, int, int, int]:
        reported_repeat = int(result.get("repeat_runs") or 0)
        if reported_repeat and reported_repeat != expected_repeat:
            raise ScriptError(
                f"repeat_runs mismatch: expected={expected_repeat}, reported={reported_repeat}"
            )

        case_results = self._extract_case_results(result)
        if len(case_results) != expected_total_inputs:
            raise ScriptError(
                f"case_results length mismatch: expected={expected_total_inputs}, actual={len(case_results)}"
            )

        pass_cases = 0
        fail_cases = 0
        flaky_cases = 0
        for idx, row in enumerate(case_results, start=1):
            status = self._case_status(row)
            attempts = row.get("attempts")
            attempts_list = attempts if isinstance(attempts, list) else []
            total_attempts = len(attempts_list) if attempts_list else expected_repeat
            passed_attempts = (
                sum(1 for a in attempts_list if isinstance(a, dict) and bool(a.get("pass")))
                if attempts_list
                else (
                    total_attempts
                    if status == "pass"
                    else 0
                )
            )
            if total_attempts != expected_repeat:
                raise ScriptError(
                    f"Input {idx} attempts mismatch: expected={expected_repeat}, actual={total_attempts}"
                )
            if status == "pass":
                if passed_attempts != expected_repeat:
                    raise ScriptError(
                        f"Input {idx} status PASS but passed_attempts={passed_attempts}/{expected_repeat}"
                    )
                pass_cases += 1
            elif status == "fail":
                if passed_attempts != 0:
                    raise ScriptError(
                        f"Input {idx} status FAIL but passed_attempts={passed_attempts}/{expected_repeat}"
                    )
                fail_cases += 1
            elif status == "flaky":
                if not (0 < passed_attempts < expected_repeat):
                    raise ScriptError(
                        f"Input {idx} status FLAKY but passed_attempts={passed_attempts}/{expected_repeat}"
                    )
                flaky_cases += 1
            else:
                raise ScriptError(f"Input {idx} has unknown status '{status}'.")

        if expected_repeat == 1 and flaky_cases > 0:
            raise ScriptError("repeat_runs=1 returned flaky cases, which is invalid.")

        total_inputs = int(result.get("total_inputs") or len(case_results))
        if total_inputs != len(case_results):
            raise ScriptError(
                f"total_inputs mismatch: total_inputs={total_inputs}, len(case_results)={len(case_results)}"
            )

        calc_fail_rate = fail_cases / total_inputs if total_inputs else 0.0
        calc_flaky_rate = flaky_cases / total_inputs if total_inputs else 0.0
        reported_fail_rate = float(result.get("fail_rate") or 0.0)
        reported_flaky_rate = float(result.get("flaky_rate") or 0.0)
        if not math.isclose(calc_fail_rate, reported_fail_rate, rel_tol=1e-9, abs_tol=1e-9):
            raise ScriptError(
                f"fail_rate mismatch: calculated={calc_fail_rate}, reported={reported_fail_rate}"
            )
        if not math.isclose(calc_flaky_rate, reported_flaky_rate, rel_tol=1e-9, abs_tol=1e-9):
            raise ScriptError(
                f"flaky_rate mismatch: calculated={calc_flaky_rate}, reported={reported_flaky_rate}"
            )

        return total_inputs, pass_cases, fail_cases, flaky_cases

    def validate_export_json(self, project_id: int, report_id: str, expected_repeat: int) -> None:
        res = self._request(
            "GET",
            f"{API_PREFIX}/projects/{project_id}/behavior/reports/{report_id}/export",
            headers=self._headers(),
            params={"format": "json"},
        )
        if res.status_code != 200:
            raise ScriptError(f"Export JSON failed ({res.status_code}): {res.text}")
        payload = res.json() if isinstance(res.json(), dict) else {}
        summary = payload.get("summary", {}) if isinstance(payload, dict) else {}
        release_gate = summary.get("release_gate", {}) if isinstance(summary, dict) else {}
        exported_repeat = int(release_gate.get("repeat_runs") or 0)
        if exported_repeat != expected_repeat:
            raise ScriptError(
                f"Export repeat_runs mismatch: expected={expected_repeat}, exported={exported_repeat}"
            )
        if "total_inputs" not in release_gate or "fail_rate" not in release_gate or "flaky_rate" not in release_gate:
            raise ScriptError("Export summary.release_gate missing required fields.")


def parse_repeats(raw: str) -> List[int]:
    values: List[int] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        n = int(token)
        if n < 1 or n > 100:
            raise argparse.ArgumentTypeError("repeat_runs must be in [1, 100].")
        values.append(n)
    deduped = sorted(set(values), key=values.index)
    if not deduped:
        raise argparse.ArgumentTypeError("At least one repeat value is required.")
    return deduped


def parse_snapshot_ids(raw: str) -> List[str]:
    values = [token.strip() for token in raw.split(",") if token.strip()]
    deduped = sorted(set(values), key=values.index)
    return deduped


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Release Gate repeat matrix verifier")
    parser.add_argument(
        "--base-url",
        default=os.getenv("AGENTGUARD_TEST_URL", "http://localhost:8000"),
        help="Backend base URL",
    )
    parser.add_argument("--email", default=os.getenv("AGENTGUARD_TEST_EMAIL"))
    parser.add_argument("--password", default=os.getenv("AGENTGUARD_TEST_PASSWORD"))
    parser.add_argument(
        "--auto-register",
        action="store_true",
        help="Auto-register temp account when credentials are missing",
    )
    parser.add_argument("--project-id", type=int, default=int(os.getenv("AGENTGUARD_PROJECT_ID", "0") or 0))
    parser.add_argument("--agent-id", default=os.getenv("AGENTGUARD_AGENT_ID", "rg-repeat-matrix-agent"))
    parser.add_argument("--org-name", default="RG Repeat Matrix Org")
    parser.add_argument("--project-name", default="RG Repeat Matrix Project")
    parser.add_argument("--seed-count", type=int, default=4)
    parser.add_argument(
        "--seed-prompt",
        default="RG matrix seed message",
        help="Prompt prefix used when seeding snapshots",
    )
    parser.add_argument(
        "--seed-model",
        default="gpt-4o-mini",
        help="Model id written into seeded snapshot payload",
    )
    parser.add_argument("--skip-seeding", action="store_true")
    parser.add_argument("--min-snapshots", type=int, default=3)
    parser.add_argument("--snapshot-limit", type=int, default=3)
    parser.add_argument(
        "--snapshot-ids",
        default="",
        help="Optional comma-separated snapshot ids to use directly",
    )
    parser.add_argument("--repeats", default="1,10,50,100")
    parser.add_argument("--poll-timeout-seconds", type=int, default=1800)
    parser.add_argument("--poll-interval-seconds", type=float, default=2.0)
    parser.add_argument("--snapshot-wait-seconds", type=int, default=60)
    parser.add_argument("--fail-rate-max", type=float, default=0.05)
    parser.add_argument("--flaky-rate-max", type=float, default=0.03)
    parser.add_argument("--model-source", choices=["detected", "platform"], default="detected")
    parser.add_argument("--new-model", default="")
    parser.add_argument("--replay-provider", choices=["openai", "anthropic", "google"], default="")
    parser.add_argument("--replay-temperature", type=float, default=None)
    parser.add_argument("--replay-top-p", type=float, default=None)
    parser.add_argument("--replay-max-tokens", type=int, default=None)
    parser.add_argument(
        "--replay-overrides-file",
        default="",
        help="Path to JSON file for replay_overrides",
    )
    parser.add_argument(
        "--replay-overrides-json",
        default="",
        help="Inline JSON string for replay_overrides (overrides file if both set)",
    )
    parser.add_argument(
        "--require-flaky",
        action="store_true",
        help="Fail run if no flaky case is observed across the repeat matrix",
    )
    parser.add_argument(
        "--output-json",
        default="",
        help="Optional path to write machine-readable run summary JSON",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    repeats = parse_repeats(args.repeats)
    direct_snapshot_ids = parse_snapshot_ids(args.snapshot_ids) if args.snapshot_ids.strip() else []

    replay_overrides: Optional[Dict[str, Any]] = None
    if args.replay_overrides_file.strip():
        file_path = args.replay_overrides_file.strip()
        with open(file_path, "r", encoding="utf-8") as f:
            replay_overrides = json.load(f)
        if not isinstance(replay_overrides, dict):
            raise ScriptError("--replay-overrides-file must contain a JSON object.")
    if args.replay_overrides_json.strip():
        try:
            parsed_inline = json.loads(args.replay_overrides_json.strip())
        except json.JSONDecodeError as exc:
            raise ScriptError(f"Invalid --replay-overrides-json: {exc}") from exc
        if not isinstance(parsed_inline, dict):
            raise ScriptError("--replay-overrides-json must be a JSON object.")
        replay_overrides = parsed_inline

    if args.min_snapshots < 1:
        parser.error("--min-snapshots must be >= 1")
    if args.snapshot_limit < 1:
        parser.error("--snapshot-limit must be >= 1")

    email = args.email
    password = args.password
    if not email or not password:
        if args.auto_register:
            email = f"rg_matrix_{secrets.token_hex(4)}@example.com"
            password = "TestPassword123!"
            info(f"Using auto-registered account: {email}")
        else:
            parser.error("Provide --email/--password or use --auto-register")

    verifier = ReleaseGateRepeatMatrixVerifier(base_url=args.base_url, timeout_seconds=120.0)
    run_results: List[RunCheckResult] = []
    try:
        if args.auto_register:
            verifier.register(email, password)
        verifier.login(email, password)
        success("Authenticated")

        project_id = verifier.ensure_project(
            project_id=args.project_id if args.project_id > 0 else None,
            org_name=args.org_name,
            project_name=args.project_name,
        )
        info(f"Using project_id={project_id}, agent_id={args.agent_id}")

        if direct_snapshot_ids and not args.skip_seeding:
            info("Explicit snapshot_ids supplied; skipping seeding.")
        elif not args.skip_seeding:
            info(f"Seeding {args.seed_count} snapshots...")
            for idx in range(1, args.seed_count + 1):
                payload = {
                    "project_id": project_id,
                    "request_data": {
                        "model": args.seed_model,
                        "messages": [
                            {
                                "role": "user",
                                "content": f"{args.seed_prompt} #{idx}",
                            }
                        ],
                    },
                    "response_data": {
                        "model": args.seed_model,
                        "choices": [{"message": {"content": f"{args.seed_prompt} response #{idx}"}}],
                        "usage": {"total_tokens": 32},
                    },
                    "latency_ms": 150 + idx,
                    "status_code": 200,
                    "agent_name": args.agent_id,
                    "chain_id": f"rg-matrix-{secrets.token_hex(4)}-{idx}",
                }
                res = verifier._request(
                    "POST", f"{API_PREFIX}/api-calls", headers=verifier._headers(), json=payload
                )
                if res.status_code != 202:
                    raise ScriptError(f"Seed api-call failed ({res.status_code}): {res.text}")
            success("Seed api-calls submitted")

        if direct_snapshot_ids:
            snapshot_ids = direct_snapshot_ids
            info(f"Using explicit snapshot_ids={snapshot_ids}")
        else:
            snapshots = verifier.wait_for_recent_snapshots(
                project_id=project_id,
                agent_id=args.agent_id,
                min_count=args.min_snapshots,
                timeout_seconds=args.snapshot_wait_seconds,
            )
            snapshot_ids = [str(x.get("id")) for x in snapshots[: args.snapshot_limit] if x.get("id") is not None]
            if not snapshot_ids:
                raise ScriptError("No recent snapshot_ids available.")
        info(f"Using snapshot_ids={snapshot_ids}")

        observed_flaky = False
        for repeat in repeats:
            info(f"Running repeat_runs={repeat} ...")
            payload: Dict[str, Any] = {
                "agent_id": args.agent_id,
                "snapshot_ids": snapshot_ids,
                "evaluation_mode": "replay_test",
                "repeat_runs": repeat,
                "fail_rate_max": args.fail_rate_max,
                "flaky_rate_max": args.flaky_rate_max,
                "model_source": args.model_source,
            }
            if args.new_model.strip():
                payload["new_model"] = args.new_model.strip()
            if args.replay_provider.strip():
                payload["replay_provider"] = args.replay_provider.strip()
            if args.replay_temperature is not None:
                payload["replay_temperature"] = float(args.replay_temperature)
            if args.replay_top_p is not None:
                payload["replay_top_p"] = float(args.replay_top_p)
            if args.replay_max_tokens is not None:
                payload["replay_max_tokens"] = int(args.replay_max_tokens)
            if replay_overrides is not None:
                payload["replay_overrides"] = replay_overrides

            t0 = time.monotonic()
            job_id = verifier.submit_validate_async(project_id=project_id, payload=payload)
            job, result = verifier.poll_job(
                project_id=project_id,
                job_id=job_id,
                timeout_seconds=args.poll_timeout_seconds,
                interval_seconds=args.poll_interval_seconds,
            )
            elapsed = time.monotonic() - t0
            status = str(job.get("status", "")).lower()
            if status != "succeeded":
                detail = job.get("error_detail")
                raise ScriptError(
                    f"Job {job_id} ended with status={status}. error_detail={json.dumps(detail, ensure_ascii=False)}"
                )
            if not result:
                raise ScriptError(f"Job {job_id} succeeded but returned no result payload.")

            total_inputs, pass_cases, fail_cases, flaky_cases = verifier._validate_result(
                result=result,
                expected_repeat=repeat,
                expected_total_inputs=len(snapshot_ids),
            )
            if flaky_cases > 0:
                observed_flaky = True

            report_id = str(result.get("report_id") or "").strip() or None
            if report_id:
                verifier.validate_export_json(
                    project_id=project_id,
                    report_id=report_id,
                    expected_repeat=repeat,
                )

            run_check = RunCheckResult(
                repeat_runs=repeat,
                job_id=job_id,
                report_id=report_id,
                total_inputs=total_inputs,
                pass_cases=pass_cases,
                fail_cases=fail_cases,
                flaky_cases=flaky_cases,
                fail_rate=float(result.get("fail_rate") or 0.0),
                flaky_rate=float(result.get("flaky_rate") or 0.0),
                elapsed_seconds=round(elapsed, 2),
            )
            run_results.append(run_check)
            success(
                f"repeat={repeat}: pass={pass_cases}, fail={fail_cases}, flaky={flaky_cases}, "
                f"fail_rate={run_check.fail_rate:.4f}, flaky_rate={run_check.flaky_rate:.4f}, elapsed={run_check.elapsed_seconds}s"
            )

        if not observed_flaky:
            if args.require_flaky:
                raise ScriptError(
                    "No flaky case observed, but --require-flaky was set."
                )
            warn(
                "No flaky case observed in this run matrix. Classification invariants were still validated for pass/fail."
            )

        print("\n" + "=" * 72)
        print("RG-2 / RG-3 Repeat Matrix Summary")
        print("=" * 72)
        for row in run_results:
            print(
                f"repeat={row.repeat_runs:<3} inputs={row.total_inputs:<2} "
                f"pass={row.pass_cases:<2} fail={row.fail_cases:<2} flaky={row.flaky_cases:<2} "
                f"fail_rate={row.fail_rate:.4f} flaky_rate={row.flaky_rate:.4f} "
                f"job={row.job_id} report={row.report_id or '-'} elapsed={row.elapsed_seconds}s"
            )
        print("=" * 72)

        output = {
            "base_url": args.base_url,
            "project_id": project_id,
            "agent_id": args.agent_id,
            "snapshot_ids": snapshot_ids,
            "repeats": repeats,
            "results": [asdict(r) for r in run_results],
        }
        if args.output_json.strip():
            output_path = args.output_json.strip()
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)
            info(f"Wrote JSON summary to {output_path}")
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except (ScriptError, httpx.HTTPError, ValueError) as exc:
        fail(str(exc))
        return 1
    finally:
        verifier.close()


if __name__ == "__main__":
    sys.exit(main())
