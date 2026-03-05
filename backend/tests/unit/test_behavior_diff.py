"""
Unit tests for Behavior Diff (tool sequence/set comparison).
"""
import pytest
from app.core.behavior_diff import (
    BehaviorDiffResult,
    compute_behavior_diff,
    tool_calls_summary_to_sequence,
)


@pytest.mark.unit
class TestToolCallsSummaryToSequence:
    def test_empty(self):
        assert tool_calls_summary_to_sequence([]) == []
        assert tool_calls_summary_to_sequence(None) == []

    def test_valid_summary(self):
        summary = [
            {"name": "search", "arguments": {}},
            {"name": "lookup", "arguments": "{}"},
            {"name": "answer", "arguments": {}},
        ]
        assert tool_calls_summary_to_sequence(summary) == ["search", "lookup", "answer"]

    def test_skips_empty_name(self):
        summary = [
            {"name": "a", "arguments": {}},
            {"name": "", "arguments": {}},
            {"name": "b", "arguments": {}},
        ]
        assert tool_calls_summary_to_sequence(summary) == ["a", "b"]

    def test_not_list_returns_empty(self):
        assert tool_calls_summary_to_sequence({}) == []


@pytest.mark.unit
class TestComputeBehaviorDiff:
    def test_identical_sequences(self):
        seq = ["search", "lookup", "answer"]
        r = compute_behavior_diff(seq, seq)
        assert r.sequence_distance == 0
        assert r.tool_divergence == 0.0
        assert r.baseline_sequence == seq
        assert r.candidate_sequence == seq

    def test_one_step_difference(self):
        baseline = ["search", "lookup", "answer"]
        candidate = ["search", "answer"]
        r = compute_behavior_diff(baseline, candidate)
        assert r.sequence_distance == 1
        assert r.tool_divergence > 0
        assert r.baseline_sequence == baseline
        assert r.candidate_sequence == candidate

    def test_completely_different_tools(self):
        baseline = ["search", "lookup"]
        candidate = ["summarize", "export"]
        r = compute_behavior_diff(baseline, candidate)
        assert r.sequence_distance == 2
        assert r.tool_divergence == 1.0

    def test_same_set_different_order(self):
        baseline = ["search", "lookup", "answer"]
        candidate = ["answer", "search", "lookup"]
        r = compute_behavior_diff(baseline, candidate)
        assert r.sequence_distance >= 1
        assert r.tool_divergence == 0.0

    def test_empty_baseline(self):
        r = compute_behavior_diff([], ["search", "answer"])
        assert r.sequence_distance == 2
        assert r.tool_divergence == 1.0

    def test_empty_candidate(self):
        r = compute_behavior_diff(["search", "answer"], [])
        assert r.sequence_distance == 2
        assert r.tool_divergence == 1.0

    def test_both_empty(self):
        r = compute_behavior_diff([], [])
        assert r.sequence_distance == 0
        assert r.tool_divergence == 0.0

    def test_to_dict(self):
        r = compute_behavior_diff(["a", "b"], ["a"])
        d = r.to_dict()
        assert d["sequence_distance"] == 1
        assert "tool_divergence" in d
        assert "tool_divergence_pct" in d
        assert d["baseline_sequence"] == ["a", "b"]
        assert d["candidate_sequence"] == ["a"]

    def test_to_dict_includes_change_band(self):
        r = compute_behavior_diff(["a", "b"], ["a"])
        d = r.to_dict()
        assert "change_band" in d
        assert d["change_band"] in ("stable", "minor", "major")

    def test_change_band_stable(self):
        r = compute_behavior_diff(["a", "b", "c"], ["a", "b", "c"])
        d = r.to_dict()
        assert d["change_band"] == "stable"
        assert d["tool_divergence_pct"] == 0

    def test_change_band_major(self):
        r = compute_behavior_diff(["search", "lookup"], ["summarize", "export"])
        d = r.to_dict()
        assert d["change_band"] == "major"
        assert d["tool_divergence_pct"] == 100.0

    def test_change_band_minor(self):
        # 18 shared tools + 2 only in baseline + 2 only in candidate -> union=22, inter=18 -> ~18% -> minor
        baseline = [f"t{i}" for i in range(18)] + ["x", "y"]
        candidate = [f"t{i}" for i in range(18)] + ["z", "w"]
        r = compute_behavior_diff(baseline, candidate)
        d = r.to_dict()
        assert d["change_band"] == "minor"
        assert 5.0 < d["tool_divergence_pct"] <= 20.0
