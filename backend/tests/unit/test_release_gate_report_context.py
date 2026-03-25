"""Report context helpers on Release Gate (A/B/C/D summaries)."""

from unittest.mock import MagicMock

from app.api.v1.endpoints import release_gate as rg
from app.models.snapshot import Snapshot


def test_build_captured_customer_material_empty():
    snap = MagicMock(spec=Snapshot)
    snap.payload = {}
    out = rg._build_captured_customer_material_from_snapshot(snap)
    assert out["present"] is False
    assert out["tool_result_excerpt_chars"] == 0


def test_build_captured_customer_material_with_tool_results():
    snap = MagicMock(spec=Snapshot)
    snap.payload = {
        "tool_events": [
            {"kind": "tool_call", "name": "x"},
            {"kind": "tool_result", "name": "x", "output": "hello world"},
        ]
    }
    out = rg._build_captured_customer_material_from_snapshot(snap)
    assert out["present"] is True
    assert out["tool_result_excerpt_chars"] >= 5
    assert "hello" in (out.get("preview") or "")


def test_build_rg_injection_report_none_when_recorded():
    out = rg._build_rg_injection_report({"mode": "recorded"}, 1)
    assert out["applied"] is False
    assert out["resolution"] == "none"


def test_aggregate_tool_flow_empty():
    out = rg._aggregate_tool_flow_from_attempts([])
    assert out["C_tool_inbound"]["summary"]["recorded_rows"] == 0
    assert out["D_tool_outbound"]["summary"]["rows_with_arguments_preview"] == 0
