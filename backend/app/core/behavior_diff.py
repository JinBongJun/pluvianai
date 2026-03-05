"""
Behavior Diff: compare two agent runs by tool sequence and tool set.

Used by Release Gate to show "how did behavior change?" (baseline vs run)
without adding new tables. Consumes canonical tool_calls_summary shape.
Human-readable band: stable (0–5%), minor (5–20%), major (>20%) by tool_divergence_pct.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal

# Human-readable band thresholds (tool_divergence_pct). Used for Stable / Minor / Major label.
STABLE_MAX_PCT = 5.0   # 0–5% → stable
MINOR_MAX_PCT = 20.0   # 5–20% → minor, >20% → major
ChangeBand = Literal["stable", "minor", "major"]


def _change_band_from_divergence_pct(pct: float) -> ChangeBand:
    """Map tool_divergence_pct to human-readable band."""
    if pct <= STABLE_MAX_PCT:
        return "stable"
    if pct <= MINOR_MAX_PCT:
        return "minor"
    return "major"


@dataclass
class BehaviorDiffResult:
    """Result of comparing baseline vs candidate tool execution."""

    sequence_distance: int
    """Edit distance between baseline and candidate tool name sequences (≥0)."""

    tool_divergence: float
    """Set divergence 0..1: 1 - |intersection|/|union|. 0 = identical sets."""

    baseline_sequence: List[str]
    """Tool names in order (baseline)."""

    candidate_sequence: List[str]
    """Tool names in order (candidate/run)."""

    def to_dict(self) -> Dict[str, Any]:
        pct = round(self.tool_divergence * 100.0, 1)
        return {
            "sequence_distance": self.sequence_distance,
            "tool_divergence": self.tool_divergence,
            "tool_divergence_pct": pct,
            "change_band": _change_band_from_divergence_pct(pct),
            "baseline_sequence": self.baseline_sequence,
            "candidate_sequence": self.candidate_sequence,
        }


def tool_calls_summary_to_sequence(summary: List[Dict[str, Any]]) -> List[str]:
    """
    Extract ordered list of tool names from canonical tool_calls_summary.
    summary shape: [{"name": str, "arguments": ...}, ...]
    """
    if not summary or not isinstance(summary, list):
        return []
    out: List[str] = []
    for item in summary:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if name is not None and str(name).strip():
            out.append(str(name).strip())
    return out


def _sequence_edit_distance(a: List[str], b: List[str]) -> int:
    """Levenshtein-style edit distance between two sequences of strings."""
    n, m = len(a), len(b)
    if n == 0:
        return m
    if m == 0:
        return n
    # dp[i][j] = min edits to turn a[:i] into b[:j]
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        curr = [i] + [0] * m
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost,
            )
        prev = curr
    return prev[m]


def _tool_set_divergence(baseline_sequence: List[str], candidate_sequence: List[str]) -> float:
    """
    Jaccard-style set divergence: 1 - |intersection|/|union|.
    Returns 0 if both sets are empty (no divergence). Otherwise 0..1.
    """
    set_a = set(baseline_sequence)
    set_b = set(candidate_sequence)
    union = set_a | set_b
    if not union:
        return 0.0
    inter = set_a & set_b
    return 1.0 - (len(inter) / len(union))


def compute_behavior_diff(
    baseline_sequence: List[str],
    candidate_sequence: List[str],
) -> BehaviorDiffResult:
    """
    Compare baseline vs candidate tool execution.

    - sequence_distance: edit distance between the two ordered sequences.
    - tool_divergence: 0..1, how much the sets of tools differ (0 = same set).
    """
    if baseline_sequence is None:
        baseline_sequence = []
    if candidate_sequence is None:
        candidate_sequence = []
    if not isinstance(baseline_sequence, list):
        baseline_sequence = []
    if not isinstance(candidate_sequence, list):
        candidate_sequence = []

    seq_dist = _sequence_edit_distance(baseline_sequence, candidate_sequence)
    div = _tool_set_divergence(baseline_sequence, candidate_sequence)
    return BehaviorDiffResult(
        sequence_distance=seq_dist,
        tool_divergence=div,
        baseline_sequence=list(baseline_sequence),
        candidate_sequence=list(candidate_sequence),
    )
