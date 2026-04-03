#!/usr/bin/env python3
"""
Baseline KPI: approximate share of tests that exercise HTTP endpoints vs pure service/domain logic.

Heuristic (intentionally simple — tune as the repo grows):
- Backend: a test *file* is "endpoint_style" if its text mentions TestClient, AsyncClient, or APIRouter.
- Otherwise the file is counted as "service_domain_style".
- Frontend: Vitest unit tests under frontend/; Playwright specs listed separately.

Run from repo root: python scripts/report_test_layer_balance.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def backend_unit_classification(repo: Path) -> dict[str, object]:
    root = repo / "backend" / "tests" / "unit"
    if not root.is_dir():
        return {"error": "backend/tests/unit not found", "endpoint_style_files": 0, "service_domain_files": 0}

    endpoint_re = re.compile(
        r"\b(TestClient|AsyncClient|APIRouter|starlette\.testclient)\b",
        re.MULTILINE,
    )
    endpoint_files = 0
    service_files = 0
    for p in sorted(root.glob("test_*.py")):
        text = _read_text(p)
        if endpoint_re.search(text):
            endpoint_files += 1
        else:
            service_files += 1

    total = endpoint_files + service_files
    ratio = (service_files / total) if total else 0.0
    return {
        "unit_test_files_total": total,
        "endpoint_style_files": endpoint_files,
        "service_domain_style_files": service_files,
        "service_domain_share_of_files": round(ratio, 4),
        "note": "File-level heuristic; prefer adding new cases under app.services/app.domain with focused imports.",
    }


def frontend_counts(repo: Path) -> dict[str, object]:
    fe = repo / "frontend"
    if not fe.is_dir():
        return {"error": "frontend not found"}

    vitest_files = list(fe.rglob("*.test.ts")) + list(fe.rglob("*.test.tsx"))
    playwright_specs = list((fe / "tests").glob("*.spec.ts")) if (fe / "tests").is_dir() else []

    return {
        "vitest_files": len(vitest_files),
        "playwright_spec_files": len(playwright_specs),
        "kpi_note": "Target: most new backend assertions in service/domain tests; Playwright for critical user flows.",
    }


def main() -> int:
    repo = Path(__file__).resolve().parent.parent
    report = {
        "repo_root": str(repo),
        "backend": backend_unit_classification(repo),
        "frontend": frontend_counts(repo),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
