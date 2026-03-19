"use client";

import React, { useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronDown, Flag, RefreshCcw, ShieldCheck, ShieldX } from "lucide-react";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { sanitizePayloadForPreview } from "./ReleaseGatePageContent";
import { ReleaseGateConfigPanel } from "./ReleaseGateConfigPanel";
import { ReleaseGateMap } from "@/components/release-gate/ReleaseGateMap";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import {
  SnapshotDetailModal,
  type SnapshotForDetail,
} from "@/components/shared/SnapshotDetailModal";
import { ClientPortal } from "@/components/shared/ClientPortal";

type GateTab = "validate" | "history";
type ThresholdPreset = "strict" | "default" | "lenient" | "custom";
type ResultCaseFilter = "all" | "failed";
type LogsStatusFilter = "all" | "failed" | "passed";
type FixHint = {
  key: string;
  label: string;
  count: number;
  severity?: string;
  hint: string;
  sample?: string;
};
type VisibleResultCase = {
  run: any;
  caseIndex: number;
};

const EVAL_CHECK_LABELS: Record<string, string> = {
  empty: "Empty / Short Answers",
  latency: "Latency Spikes",
  status_code: "HTTP Error Codes",
  refusal: "Refusal / Non-Answer",
  json: "JSON Validity",
  length: "Output Length Drift",
  repetition: "Repetition / Loops",
  required: "Required Keywords / Fields",
  format: "Format Contract",
  leakage: "PII Leakage Shield",
  tool: "Tool Use Policy",
  tool_use_policy: "Tool Use Policy",
};

const RULE_FIX_HINTS: Record<string, string> = {
  empty: "Increase answer completeness with clearer expected output and stronger baseline examples.",
  latency: "Reduce slow tool/model paths or raise latency thresholds if this workload is expected to run slower.",
  status_code:
    "Investigate provider/API errors first (keys, rate limits, retries) to remove non-success status responses.",
  refusal: "Adjust system prompt and safety boundaries so expected user requests are not refused.",
  json: "Force strict JSON format in prompt and validate schema-compatible output.",
  length: "Constrain output length and sections so responses stay close to baseline shape.",
  repetition: "Add anti-loop instructions and cap repeated lines/tokens in the response policy.",
  required: "Make required keywords/fields explicit in prompt and verify them in evaluation rules.",
  format: "Pin output structure with an exact template and example.",
  leakage: "Tighten redaction/policy checks to prevent sensitive information leakage.",
  tool_use_policy:
    "Review tool-call allowlist/order and tighten tool arguments so behavior matches baseline.",
};

function asPayloadObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRequestPart(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  const req = (payload as any).request;
  return req && typeof req === "object" && !Array.isArray(req) ? (req as Record<string, unknown>) : payload;
}

function extractSystemPromptFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const direct = (payload as any).system_prompt;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const msgs = (payload as any).messages;
  if (!Array.isArray(msgs)) return "";
  for (const msg of msgs) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as any;
    if (String(m.role ?? "").toLowerCase() !== "system") continue;
    const c = m.content;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

function buildBaselineConfigSummary(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const obj = payload as Record<string, unknown>;
  const parts: string[] = [];

  const temp = obj.temperature;
  if (typeof temp === "number" && Number.isFinite(temp)) parts.push(`Temp ${temp}`);
  const maxTok = obj.max_tokens;
  if (
    maxTok != null &&
    (typeof maxTok === "number"
      ? Number.isInteger(maxTok)
      : Number.isInteger(Number(maxTok))) &&
    Number(maxTok) > 0
  ) {
    parts.push(`Max ${Number(maxTok)}`);
  }
  const topP = obj.top_p;
  if (typeof topP === "number" && Number.isFinite(topP)) parts.push(`Top p ${topP}`);

  const tools = obj.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    const names: string[] = [];
    for (const t of tools) {
      if (!t || typeof t !== "object") continue;
      const tool = t as Record<string, unknown>;
      const fnRaw = tool.function;
      const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
      const name = String((fn as any).name ?? (tool as any).name ?? "").trim();
      if (name) names.push(name);
    }
    if (names.length > 0) {
      const previewNames = names.slice(0, 3).join(", ");
      const suffix = names.length > 3 ? `, +${names.length - 3}` : "";
      parts.push(`Tools ${names.length} (${previewNames}${suffix})`);
    } else {
      parts.push(`Tools ${tools.length}`);
    }
  }

  return parts.join(" · ");
}

function computeSimpleLineDiff(a: string, b: string, maxLines = 200): string[] {
  const aLines = a.split("\n").slice(0, maxLines);
  const bLines = b.split("\n").slice(0, maxLines);
  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 && m === 0) return [];
  // LCS DP (bounded)
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push(`  ${aLines[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`- ${aLines[i]}`);
      i++;
    } else {
      out.push(`+ ${bLines[j]}`);
      j++;
    }
  }
  while (i < n) out.push(`- ${aLines[i++]}`);
  while (j < m) out.push(`+ ${bLines[j++]}`);
  return out;
}

function normalizeViolationRuleId(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "tool") return "tool_use_policy";
  return raw;
}

function severityScore(value: unknown): number {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function toHumanRuleLabel(ruleId: string, fallback = ""): string {
  if (!ruleId) return fallback || "Behavior check";
  return (
    EVAL_CHECK_LABELS[ruleId] ??
    fallback ??
    ruleId.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
  );
}

function isCasePassing(run: any): boolean {
  const status = String(run?.case_status ?? "")
    .trim()
    .toLowerCase();
  if (status === "pass") return true;
  if (status === "fail" || status === "flaky") return false;
  return Boolean(run?.pass);
}

function buildWhatToFixHints(result: any, cases: any[]): FixHint[] {
  const byRule = new Map<
    string,
    {
      label: string;
      count: number;
      severity: string;
      severityRank: number;
      sample: string;
    }
  >();

  for (const run of Array.isArray(cases) ? cases : []) {
    if (isCasePassing(run)) continue;
    const violations = Array.isArray(run?.violations) ? run.violations : [];
    for (const violation of violations) {
      const normalizedRuleId =
        normalizeViolationRuleId(violation?.rule_id) ||
        normalizeViolationRuleId(violation?.rule_name);
      const key = normalizedRuleId || "general";
      const fallbackName = String(violation?.rule_name ?? "").trim();
      const label = toHumanRuleLabel(key, fallbackName || "Behavior check");
      const severity = String(violation?.severity ?? "")
        .trim()
        .toLowerCase();
      const score = severityScore(severity);
      const sample = String(violation?.message ?? "").trim();

      const prev = byRule.get(key);
      if (!prev) {
        byRule.set(key, {
          label,
          count: 1,
          severity,
          severityRank: score,
          sample,
        });
        continue;
      }

      byRule.set(key, {
        label: prev.label || label,
        count: prev.count + 1,
        severity: score > prev.severityRank ? severity : prev.severity,
        severityRank: Math.max(prev.severityRank, score),
        sample: prev.sample || sample,
      });
    }
  }

  const sorted = Array.from(byRule.entries())
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].severityRank - a[1].severityRank;
    })
    .slice(0, 4)
    .map(([key, value]) => {
      const hint = RULE_FIX_HINTS[key];
      return {
        key,
        label: value.label,
        count: value.count,
        severity: value.severity || undefined,
        hint: hint || "Inspect violation examples and tighten prompt/tool policy for this check.",
        sample: hint ? undefined : value.sample || undefined,
      } satisfies FixHint;
    });

  if (sorted.length > 0) return sorted;

  const reasons = Array.isArray(result?.failure_reasons)
    ? (result.failure_reasons as unknown[])
        .map(v => String(v ?? "").trim())
        .filter(Boolean)
    : [];

  return reasons.slice(0, 3).map((reason, idx) => ({
    key: `reason-${idx}`,
    label: "Run-level signal",
    count: 1,
    hint: reason,
  }));
}

function getEvalCheckParams(id: string, config: Record<string, unknown> | undefined): string {
  if (!config || typeof config !== "object") return "";
  const c = config as Record<string, unknown>;
  switch (id) {
    case "latency": {
      const w = c.warn_ms;
      const v = c.crit_ms;
      const parts: string[] = [];
      if (typeof w === "number") parts.push(`warn_ms: ${w}`);
      if (typeof v === "number") parts.push(`crit_ms: ${v}`);
      return parts.join(", ");
    }
    case "json":
      return typeof c.mode === "string" ? `mode: ${c.mode}` : "";
    case "status_code": {
      const w = c.warn_from;
      const v = c.crit_from;
      const parts: string[] = [];
      if (typeof w === "number") parts.push(`warn_from: ${w}`);
      if (typeof v === "number") parts.push(`crit_from: ${v}`);
      return parts.join(", ");
    }
    case "empty":
      return typeof c.min_chars === "number" ? `min_chars: ${c.min_chars}` : "";
    case "length":
      return (
        [c.warn_ratio, c.crit_ratio]
          .filter(Number.isFinite)
          .map((r, i) => `${i ? "crit" : "warn"}_ratio: ${r}`)
          .join(", ") || ""
      );
    case "repetition":
      return [c.warn_line_repeats, c.crit_line_repeats].filter(Number.isFinite).length
        ? `warn_line_repeats: ${c.warn_line_repeats ?? "—"}, crit_line_repeats: ${c.crit_line_repeats ?? "—"}`
        : "";
    default:
      return "";
  }
}

function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortText(value: unknown, fallback = "—", max = 96): string {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function percentFromRate(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num * 100)}%`;
}

function formatDurationMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  const anyErr = error as any;
  const detail = anyErr?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    const msg = detail.message.trim();
    if (msg) return msg;
  }
  const msg = String(anyErr?.message ?? "").trim();
  if (msg) return msg;
  return fallback;
}

function MetricTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-3",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/10",
        tone === "danger" && "border-rose-500/20 bg-rose-500/10",
        tone === "default" && "border-white/8 bg-black/30"
      )}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function AttemptDetailOverlay({
  open,
  onClose,
  inputIndex,
  attemptIndex,
  attempt,
  baselineSnapshot,
}: {
  open: boolean;
  onClose: () => void;
  inputIndex: number;
  attemptIndex: number;
  attempt: any;
  baselineSnapshot: Record<string, unknown> | null;
}) {
  const [showTestedRaw, setShowTestedRaw] = useState(false);
  const [showResponseDiff, setShowResponseDiff] = useState(false);

  const baselineInput = String(
    baselineSnapshot?.user_message ?? baselineSnapshot?.request_prompt ?? "No input text captured."
  ).trim();
  const baselineModel = String(baselineSnapshot?.model ?? "—").trim() || "—";

  const attemptViolations = Array.isArray(attempt?.violations) ? attempt.violations : [];
  type PolicyRow = {
    key: string;
    label: string;
    message: string;
    severity: string;
  };
  const policyRows: PolicyRow[] = attemptViolations
    .map((v: any, idx: number) => {
      const ruleId = String(v?.rule_id ?? "").trim();
      const ruleName = String(v?.rule_name ?? "").trim();
      const message = String(v?.message ?? "").trim();
      const severity = String(v?.severity ?? "").trim().toLowerCase();
      return {
        key: `${ruleId || "violation"}-${idx}`,
        label: ruleName || ruleId || `Violation ${idx + 1}`,
        message,
        severity,
      };
    })
    .filter((r: PolicyRow) => Boolean(r.label));

  const signalsChecksRaw = (attempt?.signals && typeof attempt.signals === "object"
    ? (attempt.signals as Record<string, unknown>).checks
    : undefined) as Record<string, unknown> | undefined;
  const signalsRows = signalsChecksRaw
    ? Object.entries(signalsChecksRaw).map(([id, status]) => {
        const normalizedId = normalizeViolationRuleId(id);
        const label = toHumanRuleLabel(normalizedId, id);
        const s = String(status ?? "").trim().toLowerCase();
        return {
          id: normalizedId || id,
          label,
          status: s,
          pass: s === "pass",
          applicable: s === "pass" || s === "fail",
        };
      })
    : [];
  const signalsDetailsRaw =
    attempt?.signals && typeof attempt.signals === "object"
      ? ((attempt.signals as any).details as Record<string, unknown> | undefined)
      : undefined;
  const signalsApplicable = signalsRows.filter(r => r.applicable);
  const signalsPassed = signalsApplicable.filter(r => r.pass);

  const formatSignalWhy = (id: string, raw: unknown): string => {
    const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const status = String(d.status ?? "").trim().toLowerCase();
    if (!status) return "";
    if (id === "empty") {
      const min = d.min_chars;
      const actual = d.actual_chars;
      return `min_chars=${String(min ?? "—")}, actual_chars=${String(actual ?? "—")}`;
    }
    if (id === "latency") {
      const failMs = d.fail_ms;
      const actualMs = d.actual_ms;
      return `fail_ms=${String(failMs ?? "—")}, actual_ms=${String(actualMs ?? "—")}`;
    }
    if (id === "status_code") {
      const failFrom = d.fail_from;
      const actual = d.actual_status;
      return `fail_from=${String(failFrom ?? "—")}, actual=${String(actual ?? "—")}`;
    }
    if (id === "length") {
      const failRatio = d.fail_ratio;
      const ratio = d.ratio;
      const baselineLen = d.baseline_len;
      const actual = d.actual_chars;
      return `fail_ratio=${String(failRatio ?? "—")}, ratio=${String(ratio ?? "—")}, baseline_len=${String(
        baselineLen ?? "—"
      )}, actual_chars=${String(actual ?? "—")}`;
    }
    if (id === "repetition") {
      const fail = d.fail_line_repeats;
      const max = d.max_line_repeats;
      return `fail_line_repeats=${String(fail ?? "—")}, max_line_repeats=${String(max ?? "—")}`;
    }
    if (id === "json") {
      const mode = d.mode;
      const checked = d.checked;
      const parsedOk = d.parsed_ok;
      return `mode=${String(mode ?? "—")}, checked=${String(checked ?? "—")}, parsed_ok=${String(
        parsedOk ?? "—"
      )}`;
    }
    if (id === "refusal") {
      const matched = d.matched;
      return `matched=${String(matched ?? "—")}`;
    }
    return "";
  };

  const candidateSnapshot =
    attempt?.candidate_snapshot &&
    typeof attempt.candidate_snapshot === "object" &&
    !Array.isArray(attempt.candidate_snapshot)
      ? (attempt.candidate_snapshot as Record<string, unknown>)
      : null;
  const candidatePayloadPreview = (() => {
    if (attempt?.replay?.provider_error?.response_preview) {
      return String(attempt.replay.provider_error.response_preview);
    }
    try {
      const responseDataKeys =
        (candidateSnapshot as any)?.response_data_keys ??
        (attempt?.replay?.provider_error && typeof attempt.replay.provider_error === "object"
          ? (attempt.replay.provider_error as any).response_data_keys
          : undefined);
      return JSON.stringify(
        {
          summary: attempt?.summary ?? {},
          replay: attempt?.replay ?? {},
          behavior_diff: attempt?.behavior_diff ?? {},
          failure_reasons: attempt?.failure_reasons ?? [],
          response_data_keys: responseDataKeys ?? [],
          response_extract_path:
            (candidateSnapshot as any)?.response_extract_path ??
            (attempt?.replay?.provider_error && typeof attempt.replay.provider_error === "object"
              ? (attempt.replay.provider_error as any).response_extract_path
              : undefined) ??
            null,
          response_extract_reason:
            (candidateSnapshot as any)?.response_extract_reason ??
            (attempt?.replay?.provider_error && typeof attempt.replay.provider_error === "object"
              ? (attempt.replay.provider_error as any).response_extract_reason
              : undefined) ??
            null,
        },
        null,
        2
      );
    } catch {
      return "{}";
    }
  })();
  const candidateModel = String(
    candidateSnapshot?.model ??
      (attempt?.summary?.target && typeof attempt.summary.target === "object"
        ? (attempt.summary.target as Record<string, unknown>).model
        : undefined) ??
      "—"
  ).trim() || "—";
  const candidateProvider = String(candidateSnapshot?.provider ?? "—").trim() || "—";
  const candidateInput = String(candidateSnapshot?.input_text ?? baselineInput ?? "—").trim() || "—";
  const candidateResponse = String(
    candidateSnapshot?.response_preview ??
      attempt?.replay?.provider_error?.response_preview ??
      ""
  ).trim();
  const baselineResponseFromAttempt = String(
    (attempt?.baseline_snapshot && typeof attempt.baseline_snapshot === "object"
      ? (attempt.baseline_snapshot as any).response_preview
      : "") ?? ""
  ).trim();
  const baselineResponseFromSnapshot = String(
    (baselineSnapshot?.response_text ?? baselineSnapshot?.response ?? "") || ""
  ).trim();
  const baselineResponse = baselineResponseFromAttempt || baselineResponseFromSnapshot;
  const baselineResponseStatus = String(
    (attempt as any)?.baseline_snapshot?.response_preview_status ?? ""
  )
    .trim()
    .toLowerCase();
  const baselineCaptureReason = String((attempt as any)?.baseline_snapshot?.capture_reason ?? "").trim();
  const candidateResponseDataKeys = Array.isArray((candidateSnapshot as any)?.response_data_keys)
    ? ((candidateSnapshot as any).response_data_keys as unknown[])
    : [];
  const candidateResponseStatus = String((candidateSnapshot as any)?.response_preview_status ?? "")
    .trim()
    .toLowerCase();
  const candidateExtractPath = String((candidateSnapshot as any)?.response_extract_path ?? "").trim();
  const candidateExtractReason = String((candidateSnapshot as any)?.response_extract_reason ?? "").trim();
  const candidateResponseUsedFallback =
    candidateExtractReason === "serialized_json_fallback" ||
    candidateExtractReason === "serialized_json_exception_fallback" ||
    candidateExtractReason === "parser_exception_fallback" ||
    candidateExtractReason === "extract_meta_runtime_error" ||
    candidateExtractReason === "extract_meta_invalid";
  const baselineResponseDataKeys = Array.isArray((attempt as any)?.baseline_snapshot?.response_data_keys)
    ? (((attempt as any).baseline_snapshot.response_data_keys as unknown[]) ?? [])
    : [];
  const responseDiffLines = useMemo(() => {
    if (!baselineResponse || !candidateResponse) return [];
    return computeSimpleLineDiff(baselineResponse, candidateResponse, 200);
  }, [baselineResponse, candidateResponse]);

  const pass = Boolean(attempt?.pass);
  const decisionReasons: string[] = Array.isArray(attempt?.failure_reasons)
    ? (attempt.failure_reasons as string[])
    : [];
  type SeverityRank = 0 | 1 | 2 | 3;
  type DecisionSeverity = "low" | "medium" | "high" | "critical";
  type DecisionIssue = {
    source: "policy" | "gate" | "reason";
    severity: DecisionSeverity;
    message: string;
  };
  const normalizeSeverity = (
    value: unknown,
    fallback: DecisionSeverity = "medium"
  ): DecisionSeverity => {
    const s = String(value ?? "").trim().toLowerCase();
    if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
    return fallback;
  };
  const severityRank = (value: unknown): SeverityRank => {
    const s = String(value ?? "").trim().toLowerCase();
    if (s === "critical") return 3;
    if (s === "high") return 2;
    if (s === "medium") return 1;
    return 0;
  };
  const gateRows: Array<{
    id: "tool_integrity" | "latency" | "regression_diff";
    label: string;
    status: "pass" | "fail" | "not_applicable";
    reason: string;
  }> = [
    {
      id: "tool_integrity",
      label: "Tool Integrity",
      status: policyRows.length > 0 ? "fail" : "pass",
      reason:
        policyRows.length > 0
          ? policyRows[0]?.message || `${policyRows.length} policy violation(s) detected`
          : "No policy violations detected.",
    },
    {
      id: "latency",
      label: "Latency",
      status: (() => {
        const v = String((signalsChecksRaw as any)?.latency ?? "").trim().toLowerCase();
        if (v === "pass" || v === "fail" || v === "not_applicable") return v;
        return "not_applicable";
      })(),
      reason: formatSignalWhy("latency", (signalsDetailsRaw as any)?.latency) || "No latency evidence.",
    },
    {
      id: "regression_diff",
      label: "Regression Diff",
      status:
        Number((attempt?.behavior_diff ?? {}).sequence_edit_distance ?? 0) > 0 ||
        Number((attempt?.behavior_diff ?? {}).tool_divergence_pct ?? 0) > 0
          ? "fail"
          : "pass",
      reason:
        Number((attempt?.behavior_diff ?? {}).sequence_edit_distance ?? 0) > 0
          ? `Sequence edits ${Number((attempt?.behavior_diff ?? {}).sequence_edit_distance ?? 0)}`
          : "No meaningful behavior diff detected.",
    },
  ];
  const decisionHeadline = (() => {
    const toHeadline = (reason: string) => `Reason: ${reason}`;
    if (pass) return toHeadline("No blocking regressions detected.");
    const gateSeverityMap: Record<(typeof gateRows)[number]["id"], DecisionSeverity> = {
      tool_integrity: "critical",
      latency: "high",
      regression_diff: "high",
    };
    const issues: DecisionIssue[] = [];
    policyRows.forEach(row => {
      issues.push({
        source: "policy",
        severity: normalizeSeverity(row.severity, "high"),
        message: row.message || row.label,
      });
    });
    gateRows
      .filter(g => g.status === "fail")
      .forEach(g => {
        issues.push({
          source: "gate",
          severity: gateSeverityMap[g.id] ?? "medium",
          message: g.reason || `${g.label} failed`,
        });
      });
    if (issues.length === 0 && decisionReasons.length > 0) {
      decisionReasons.forEach(reason => {
        issues.push({
          source: "reason",
          severity: "medium",
          message: String(reason ?? "").trim(),
        });
      });
    }
    const sorted = issues
      .filter(i => Boolean(i.message))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    const top = sorted[0];
    if (top && severityRank(top.severity) >= 2) {
      return toHeadline(top.message);
    }
    const failCount = gateRows.filter(g => g.status === "fail").length + policyRows.length;
    if (failCount > 1) return toHeadline(`${failCount} blocking checks failed.`);
    if (top?.message) return toHeadline(top.message);
    return toHeadline("Blocking issues detected.");
  })();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 backdrop-blur-md p-6">
      <div className="w-full max-w-[1400px] h-[86vh] rounded-[28px] border border-white/10 bg-[#0d0f14] shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-6 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
              Unit Diagnostics
            </div>
            <div className="mt-1 flex items-center gap-3">
              <h2 className="text-base font-semibold text-white">
                Input {inputIndex + 1} · Attempt {attemptIndex + 1}
              </h2>
              <span
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase",
                  pass
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                )}
              >
                {pass ? "PASS" : "FAIL"}
              </span>
              <span className="text-[11px] text-slate-400">
                {formatDurationMs((attempt?.replay ?? {}).avg_latency_ms)}
              </span>
              <span className="text-[11px] text-slate-500 truncate max-w-[360px]">
                {baselineModel} → {candidateModel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-3 border-b border-white/8">
          <div
            className={clsx(
              "rounded-2xl border px-4 py-3",
              pass
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Decision
                </div>
                <div className="mt-1 text-sm font-bold text-white">
                  {pass ? "RELEASE READY" : "RELEASE BLOCKED"}
                </div>
                <div className="mt-1 text-xs text-slate-200">{decisionHeadline}</div>
              </div>
              <div className="text-xs text-slate-300">
                {baselineModel} → {candidateModel} · {formatDurationMs((attempt?.replay ?? {}).avg_latency_ms)}
              </div>
            </div>
            {!pass && decisionReasons.length > 0 && (
              <div className="mt-2 space-y-1 text-xs text-rose-100">
                {decisionReasons.slice(0, 3).map((r: string, i: number) => (
                  <div key={`${r}-${i}`}>- {r}</div>
                ))}
                {decisionReasons.length > 3 && (
                  <div className="text-slate-300">+{decisionReasons.length - 3} more</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 border-r border-white/8 p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Replay attempt
            </div>
            <div className="mt-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-3 h-[calc(100%-24px)]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Gate Results
                </div>
                {attempt?.trace_id && (
                  <div className="truncate text-[11px] text-slate-500 max-w-[220px]">
                    {String(attempt.trace_id)}
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-3 h-[calc(100%-22px)] overflow-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  {gateRows.map(g => (
                    <div key={g.id} className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{g.label}</div>
                        <span
                          className={clsx(
                            "text-[10px] font-black uppercase",
                            g.status === "fail"
                              ? "text-rose-300"
                              : g.status === "pass"
                                ? "text-emerald-300"
                                : "text-slate-500"
                          )}
                        >
                          {g.status === "not_applicable" ? "N/A" : g.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 break-words text-xs text-slate-300">{g.reason}</div>
                    </div>
                  ))}
                </div>

                {Array.isArray(attempt?.failure_reasons) && attempt.failure_reasons.length > 0 ? (
                  <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                      Why failed
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {attempt.failure_reasons.slice(0, 5).map((r: string, i: number) => (
                        <div key={`${r}-${i}`} className="text-xs text-slate-200">
                          {r}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                      Response comparison
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowResponseDiff(v => !v)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-200 hover:bg-white/10"
                    >
                      {showResponseDiff ? "Hide diff" : "Show diff"}
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/8 bg-black/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        Baseline
                      </div>
                      {baselineResponseDataKeys.length > 0 && (
                        <div className="mt-1 truncate text-[10px] text-slate-500">
                          Keys: {baselineResponseDataKeys.slice(0, 6).map(k => String(k)).join(", ")}
                          {baselineResponseDataKeys.length > 6 ? "…" : ""}
                        </div>
                      )}
                      <p className="mt-2 max-h-28 overflow-auto custom-scrollbar text-xs leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                        {baselineResponse
                          ? baselineResponse
                          : baselineResponseStatus === "not_captured"
                            ? `Baseline response not captured (original logs did not store response text).${
                                baselineCaptureReason ? ` (${baselineCaptureReason})` : ""
                              }`
                            : baselineResponseStatus === "empty"
                              ? "Baseline response is empty."
                              : "Baseline response preview unavailable."}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        Candidate
                      </div>
                      {candidateResponseDataKeys.length > 0 && (
                        <div className="mt-1 truncate text-[10px] text-slate-500">
                          Keys: {candidateResponseDataKeys.slice(0, 6).map(k => String(k)).join(", ")}
                          {candidateResponseDataKeys.length > 6 ? "…" : ""}
                        </div>
                      )}
                      {candidateResponse && candidateResponseUsedFallback && (
                        <div className="mt-1 text-[10px] text-amber-300">
                          Preview recovered via fallback path.
                        </div>
                      )}
                      {!candidateResponse && (candidateExtractPath || candidateExtractReason) && (
                        <div className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                          {candidateExtractPath ? <div>Path: {candidateExtractPath}</div> : null}
                          {candidateExtractReason ? <div>Why empty: {candidateExtractReason}</div> : null}
                        </div>
                      )}
                      <p className="mt-2 max-h-28 overflow-auto custom-scrollbar text-xs leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                        {candidateResponse
                          ? candidateResponse
                          : candidateResponseStatus === "tool_calls_only"
                            ? "Candidate returned tool calls only (no assistant text)."
                            : candidateResponseStatus === "empty"
                              ? "Candidate response text is empty. Check extractor path/reason and debug JSON."
                              : "—"}
                      </p>
                    </div>
                  </div>

                  {showResponseDiff && (
                    <div className="mt-3 rounded-xl border border-white/8 bg-black/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        Diff (lines)
                      </div>
                      {baselineResponse && candidateResponse ? (
                        <pre className="mt-2 max-h-40 overflow-auto custom-scrollbar text-[11px] leading-relaxed whitespace-pre-wrap break-words text-slate-200">
                          {responseDiffLines.join("\n")}
                        </pre>
                      ) : (
                        <div className="mt-2 text-xs text-slate-500">
                          Diff unavailable (missing baseline or candidate response preview).
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowTestedRaw(v => !v)}
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-200 hover:bg-white/10"
                >
                  {showTestedRaw ? "Hide debug JSON" : "View full raw debug JSON"}
                </button>
                {showTestedRaw && (
                  <pre className="rounded-2xl border border-white/8 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                    {candidatePayloadPreview}
                  </pre>
                )}
              </div>
            </div>
          </div>

          <div className="w-[330px] min-w-[330px] p-5 space-y-3 overflow-y-auto custom-scrollbar">
            <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Replay meta
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Model</div>
                  <div className="mt-1 truncate">{candidateModel}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Provider</div>
                  <div className="mt-1 truncate">{candidateProvider}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Status code</div>
                  <div className="mt-1">{String(candidateSnapshot?.status_code ?? "—")}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Latency</div>
                  <div className="mt-1">{formatDurationMs((attempt?.replay ?? {}).avg_latency_ms)}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <MetricTile label="Attempted" value={Number((attempt?.replay ?? {}).attempted ?? 0)} />
                <MetricTile
                  label="Succeeded"
                  value={Number((attempt?.replay ?? {}).succeeded ?? 0)}
                  tone="success"
                />
                <MetricTile
                  label="Failed"
                  value={Number((attempt?.replay ?? {}).failed ?? 0)}
                  tone={Number((attempt?.replay ?? {}).failed ?? 0) > 0 ? "danger" : "default"}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Signals checks (Why)
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {signalsChecksRaw ? (
                  <>
                    {signalsPassed.length}/{signalsApplicable.length || 0} checks passed
                  </>
                ) : (
                  <>No signals captured for this attempt.</>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {!signalsChecksRaw ? (
                  <div className="text-xs text-slate-500">
                    Signals eval was not executed (or not returned) for this attempt.
                  </div>
                ) : signalsRows.length === 0 ? (
                  <div className="text-xs text-slate-500">No signal checks returned.</div>
                ) : (
                  signalsRows.map(row => (
                    <div
                      key={row.id}
                      className={clsx(
                        "rounded-xl border px-2.5 py-2 text-xs",
                        row.pass
                          ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-200"
                          : "border-rose-500/20 bg-rose-500/8 text-rose-200"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate pr-3">{row.label}</span>
                        <span className="shrink-0 font-black">
                          {row.status === "not_applicable" ? "N/A" : row.pass ? "PASS" : "FAIL"}
                        </span>
                      </div>
                      {signalsDetailsRaw && (
                        (() => {
                          const why = formatSignalWhy(row.id, (signalsDetailsRaw as any)?.[row.id]);
                          return why ? (
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-300 break-words">
                              {why}
                            </div>
                          ) : null;
                        })()
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Policy checks
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {policyRows.length === 0 ? "No policy violations." : `${policyRows.length} violation(s) detected`}
              </div>
              <div className="mt-2 space-y-2">
                {policyRows.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    This attempt produced no BehaviorRule violations.
                  </div>
                ) : (
                  policyRows.slice(0, 6).map(row => (
                    <div
                      key={row.key}
                      className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-2.5 py-2 text-xs text-rose-200"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate pr-3 font-semibold">{row.label}</span>
                        {row.severity ? (
                          <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase text-slate-200">
                            {row.severity}
                          </span>
                        ) : null}
                      </div>
                      {row.message ? (
                        <div className="mt-1 text-[11px] leading-relaxed text-rose-100/90">{row.message}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Tool behavior
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                  Sequence edits {Number((attempt?.behavior_diff ?? {}).sequence_edit_distance ?? 0)}
                </div>
                <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                  Tool divergence{" "}
                  {percentFromRate(Number((attempt?.behavior_diff ?? {}).tool_divergence_pct ?? 0) / 100)}
                </div>
              </div>
              {Array.isArray(attempt?.failure_reasons) && attempt.failure_reasons.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {attempt.failure_reasons.slice(0, 4).map((r: string, i: number) => (
                    <div key={`${r}-${i}`} className="rounded-lg bg-rose-500/10 px-2.5 py-2 text-xs text-rose-200">
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryDetailCard({
  item,
  report,
  onClose,
}: {
  item: any;
  report: any;
  onClose?: () => void;
}) {
  const summary =
    report?.summary && typeof report.summary === "object" && !Array.isArray(report.summary)
      ? (report.summary as Record<string, unknown>)
      : null;
  const gateSummaryRaw = summary?.release_gate;
  const gateSummary =
    gateSummaryRaw && typeof gateSummaryRaw === "object" && !Array.isArray(gateSummaryRaw)
      ? (gateSummaryRaw as Record<string, unknown>)
      : null;
  const thresholdsRaw =
    item?.thresholds && typeof item.thresholds === "object" && !Array.isArray(item.thresholds)
      ? (item.thresholds as Record<string, unknown>)
      : gateSummary?.thresholds &&
          typeof gateSummary.thresholds === "object" &&
          !Array.isArray(gateSummary.thresholds)
        ? (gateSummary.thresholds as Record<string, unknown>)
        : null;
  const violations = Array.isArray(report?.violations)
    ? (report.violations as Array<Record<string, unknown>>)
    : [];
  const totalInputs =
    Number(gateSummary?.total_inputs ?? 0) ||
    Number(item?.passed_runs ?? 0) + Number(item?.failed_runs ?? 0);
  const failedInputs = Number(gateSummary?.failed_inputs ?? item?.failed_runs ?? 0);
  const flakyInputs = Number(gateSummary?.flaky_inputs ?? 0);
  const repeatRuns = Number(item?.repeat_runs ?? gateSummary?.repeat_runs ?? 0) || "—";

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/30 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
              item?.status === "pass"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            )}
          >
            {item?.status === "pass" ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldX className="h-3.5 w-3.5" />
            )}
            {item?.status === "pass" ? "Passed" : "Failed"}
          </div>
          <div className="mt-3 text-lg font-black tracking-tight text-white">Run detail</div>
          <div className="mt-1 text-xs text-slate-400">{formatDateTime(item?.created_at)}</div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
          >
            Close
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricTile label="Repeats" value={repeatRuns} />
        <MetricTile label="Inputs" value={totalInputs || "—"} />
        <MetricTile
          label="Failed inputs"
          value={failedInputs}
          tone={failedInputs > 0 ? "danger" : "default"}
        />
        <MetricTile label="Flaky inputs" value={flakyInputs} />
      </div>

      <div className="space-y-2 text-xs">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Trace ID
          </div>
          <div className="mt-1 break-all text-slate-200">
            {item?.trace_id || report?.trace_id || "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Baseline trace
          </div>
          <div className="mt-1 break-all text-slate-200">
            {item?.baseline_trace_id || report?.baseline_run_ref || "—"}
          </div>
        </div>
      </div>

      {gateSummary && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-200">
            Fail rate {percentFromRate(gateSummary.fail_rate)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-200">
            Flaky rate {percentFromRate(gateSummary.flaky_rate)}
          </span>
          {typeof gateSummary.ratio_band === "string" && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-200">
              Band {gateSummary.ratio_band}
            </span>
          )}
        </div>
      )}

      {thresholdsRaw && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Thresholds
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-200">
            {typeof thresholdsRaw.fail_rate_max !== "undefined" && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
                Fail max {percentFromRate(thresholdsRaw.fail_rate_max)}
              </span>
            )}
            {typeof thresholdsRaw.flaky_rate_max !== "undefined" && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
                Flaky max {percentFromRate(thresholdsRaw.flaky_rate_max)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          Violations
        </div>
        {violations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-500">
            No stored violations for this run.
          </div>
        ) : (
          <div className="space-y-2">
            {violations.slice(0, 5).map((violation, idx) => (
              <div
                key={`${String(violation.rule_id ?? idx)}-${idx}`}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm font-semibold text-slate-100">
                    {String(violation.rule_name ?? violation.rule_id ?? `Violation ${idx + 1}`)}
                  </div>
                  {typeof violation.severity === "string" && (
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-black uppercase text-slate-300">
                      {violation.severity}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {String(violation.message ?? "No message")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReleaseGateExpandedView() {
  const ctx = useContext(ReleaseGatePageContext) as Record<string, unknown>;

  const orgId = ctx.orgId as string;
  const projectId = ctx.projectId as number;
  const project = ctx.project as { name?: string } | undefined;
  const tab = ctx.tab as GateTab;
  const setTab = ctx.setTab as (t: GateTab) => void;
  const setViewMode = ctx.setViewMode as (m: "map" | "expanded") => void;
  const setAgentId = ctx.setAgentId as (s: string) => void;
  const setSelectedAgent = ctx.setSelectedAgent as (a: any) => void;
  const setDatasetIds = ctx.setDatasetIds as (a: string[]) => void;
  const setSnapshotIds = ctx.setSnapshotIds as (a: string[]) => void;
  const setRunSnapshotIds = ctx.setRunSnapshotIds as React.Dispatch<React.SetStateAction<string[]>>;
  const setRunDatasetIds = ctx.setRunDatasetIds as React.Dispatch<React.SetStateAction<string[]>>;
  const setExpandedDatasetId = ctx.setExpandedDatasetId as React.Dispatch<
    React.SetStateAction<string | null>
  >;
  const selectedAgent = ctx.selectedAgent as {
    agent_id: string;
    display_name?: string;
    model?: string;
  } | null;
  const agents = ctx.agents as any[];
  const agentsLoaded = Boolean(ctx.agentsLoaded);
  const onMapSelectAgent = ctx.onMapSelectAgent as (id: string) => void;
  const requestSystemPrompt = ctx.requestSystemPrompt as string;
  const runDataPrompt = (ctx.runDataPrompt as string) ?? "";
  const baselineSeedSnapshot = (ctx.baselineSeedSnapshot as Record<string, unknown> | null) ?? null;
  const baselinePayload = (ctx.baselinePayload as Record<string, unknown> | null) ?? null;
  const nodeBasePayload = (ctx.nodeBasePayload as Record<string, unknown> | null) ?? null;
  const configSourceLabel = (ctx.configSourceLabel as string) || "";
  const recentSnapshots = ctx.recentSnapshots as any[];
  const recentSnapshotsLoading = Boolean(ctx.recentSnapshotsLoading);
  const recentSnapshotsError = ctx.recentSnapshotsError as unknown;
  const mutateRecentSnapshots = ctx.mutateRecentSnapshots as (() => unknown) | undefined;
  const baselineSnapshotsById = ctx.baselineSnapshotsById as Map<string, Record<string, unknown>>;
  const runSnapshotIds = ctx.runSnapshotIds as string[];
  const setDataSource = ctx.setDataSource as (s: "recent" | "datasets") => void;
  const snapshotEvalFailed = ctx.snapshotEvalFailed as (
    s: Record<string, unknown> | null
  ) => boolean;
  const setBaselineDetailSnapshot = ctx.setBaselineDetailSnapshot as (
    s: SnapshotForDetail | null
  ) => void;
  const datasets = ctx.datasets as {
    id: string;
    label?: string;
    snapshot_count?: number;
    snapshot_ids?: unknown[];
  }[];
  const datasetsLoading = Boolean(ctx.datasetsLoading);
  const datasetsError = ctx.datasetsError as unknown;
  const mutateDatasets = ctx.mutateDatasets as (() => unknown) | undefined;
  const runDatasetIds = ctx.runDatasetIds as string[];
  const expandedDatasetId = ctx.expandedDatasetId as string | null;
  const expandedDatasetSnapshots = ctx.expandedDatasetSnapshots as Record<string, unknown>[];
  const datasetSnapshotsLoading = Boolean(ctx.datasetSnapshotsLoading);
  const datasetSnapshotsError = ctx.datasetSnapshotsError as unknown;
  const datasetSnapshots404 = Boolean(ctx.datasetSnapshots404);
  const mutateDatasetSnapshots = ctx.mutateDatasetSnapshots as (() => unknown) | undefined;
  const expandedDatasetSnapshotsLoading = Boolean(ctx.expandedDatasetSnapshotsLoading);
  const expandedDatasetSnapshotsError = ctx.expandedDatasetSnapshotsError as unknown;
  const expandedDatasetSnapshots404 = Boolean(ctx.expandedDatasetSnapshots404);
  const mutateExpandedDatasetSnapshots = ctx.mutateExpandedDatasetSnapshots as
    | (() => unknown)
    | undefined;
  const selectedBaselineCount = ctx.selectedBaselineCount as number;
  const selectedDataSummary = ctx.selectedDataSummary as string;
  const thresholdPreset = ctx.thresholdPreset as ThresholdPreset;
  const setThresholdPreset = ctx.setThresholdPreset as (k: ThresholdPreset) => void;
  const normalizeGateThresholds = ctx.normalizeGateThresholds as (
    a: unknown,
    b: unknown
  ) => { failRateMax: number; flakyRateMax: number };
  const failRateMax = Number(ctx.failRateMax ?? 0);
  const setFailRateMax = ctx.setFailRateMax as (n: number) => void;
  const flakyRateMax = Number(ctx.flakyRateMax ?? 0);
  const setFlakyRateMax = ctx.setFlakyRateMax as (n: number) => void;
  const newModel = ctx.newModel as string;
  const setNewModel = ctx.setNewModel as (s: string) => void;
  const modelOverrideEnabled = Boolean(ctx.modelOverrideEnabled);
  const setModelOverrideEnabled = ctx.setModelOverrideEnabled as (b: boolean) => void;
  const replayProvider = String(ctx.replayProvider ?? "")
    .trim()
    .toLowerCase();
  const requestBody = ctx.requestBody as Record<string, unknown>;
  const setRequestBody = ctx.setRequestBody as React.Dispatch<
    React.SetStateAction<Record<string, unknown>>
  >;
  const applySystemPromptToBody = ctx.applySystemPromptToBody as (
    b: Record<string, unknown>,
    s: string
  ) => Record<string, unknown>;
  const repeatRuns = ctx.repeatRuns as number;
  const setRepeatRuns = ctx.setRepeatRuns as (n: number) => void;
  const repeatDropdownOpen = ctx.repeatDropdownOpen as boolean;
  const setRepeatDropdownOpen = ctx.setRepeatDropdownOpen as (b: boolean) => void;
  const repeatDropdownRef = ctx.repeatDropdownRef as React.RefObject<HTMLDivElement>;
  const REPEAT_OPTIONS = ctx.REPEAT_OPTIONS as readonly number[];
  const isHeavyRepeat = Boolean(ctx.isHeavyRepeat);
  const canRunValidate = ctx.canRunValidate as boolean;
  const keyBlocked = Boolean(ctx.keyBlocked);
  const keyRegistrationMessage = (ctx.keyRegistrationMessage as string) || "";
  const isValidating = ctx.isValidating as boolean;
  const activeJobId = (ctx.activeJobId as string | null) ?? null;
  const cancelRequested = Boolean(ctx.cancelRequested);
  const handleValidate = ctx.handleValidate as () => void;
  const handleCancelActiveJob =
    (ctx.handleCancelActiveJob as (() => void) | undefined) ?? undefined;
  const runError = (ctx.error as string) || "";
  const result = ctx.result as any;
  const expandedCaseIndex = ctx.expandedCaseIndex as number | null;
  const setExpandedCaseIndex = ctx.setExpandedCaseIndex as (n: number | null) => void;
  const baselineDetailSnapshot = ctx.baselineDetailSnapshot as SnapshotForDetail | null;
  const agentEvalData = ctx.agentEvalData as Record<string, unknown> | undefined;
  const runEvalElements = (ctx.runEvalElements as Array<{ name: string }>) ?? [];
  const historyStatus = ctx.historyStatus as "all" | "pass" | "fail";
  const setHistoryStatus = ctx.setHistoryStatus as (s: "all" | "pass" | "fail") => void;
  const historyTraceId = ctx.historyTraceId as string;
  const setHistoryTraceId = ctx.setHistoryTraceId as (s: string) => void;
  const historyOffset = ctx.historyOffset as number;
  const setHistoryOffset = ctx.setHistoryOffset as (n: number | ((v: number) => number)) => void;
  const historyLimit = ctx.historyLimit as number;
  const historyLoading = ctx.historyLoading as boolean;
  const historyItems = ctx.historyItems as any[];
  const historyTotal = ctx.historyTotal as number;
  const mutateHistory = ctx.mutateHistory as () => void;
  const selectedRunId = ctx.selectedRunId as string | null;
  const setSelectedRunId = ctx.setSelectedRunId as (id: string | null) => void;
  const selectedRunReport = ctx.selectedRunReport as any;
  const setExpandedHistoryId = ctx.setExpandedHistoryId as
    | ((id: string | null) => void)
    | undefined;
  const runDataProvider = ctx.runDataProvider as string;
  const runDataModel = ctx.runDataModel as string;
  const projectName = project?.name;
  const REPLAY_THRESHOLD_PRESETS = ctx.REPLAY_THRESHOLD_PRESETS as Record<
    string,
    { label: string; failRateMax: number; flakyRateMax: number }
  >;

  const agentId = selectedAgent?.agent_id ?? "";
  const [dataPanelTab, setDataPanelTab] = useState<"logs" | "datasets">("logs");
  const [rightPanelTab, setRightPanelTab] = useState<"results" | "history">("results");
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [resultCaseFilter, setResultCaseFilter] = useState<ResultCaseFilter>("all");
  const [detailAttemptView, setDetailAttemptView] = useState<{
    attempt: any;
    caseIndex: number;
    attemptIndex: number;
    baselineSnapshot: Record<string, unknown> | null;
  } | null>(null);

  const [logsStatusFilter, setLogsStatusFilter] = useState<LogsStatusFilter>("all");
  const [logsSortMode, setLogsSortMode] = useState<"newest" | "oldest">("newest");
  const [logsLimitInput, setLogsLimitInput] = useState<string>("30");
  const requestTools = useMemo(
    () => (Array.isArray(requestBody.tools) ? requestBody.tools : []),
    [requestBody]
  );
  const resultCases = useMemo(() => {
    if (Array.isArray(result?.run_results)) return result.run_results;
    if (Array.isArray(result?.case_results)) return result.case_results;
    return [];
  }, [result]);
  const failedCaseCount = useMemo(
    () => resultCases.filter((run: any) => !isCasePassing(run)).length,
    [resultCases]
  );
  const visibleResultCases = useMemo(
    () =>
      resultCases
        .map((run: any, caseIndex: number) => ({ run, caseIndex }))
        .filter(({ run }: VisibleResultCase) => (resultCaseFilter === "all" ? true : !isCasePassing(run))),
    [resultCases, resultCaseFilter]
  );
  const whatToFixHints = useMemo(() => buildWhatToFixHints(result, resultCases), [result, resultCases]);
  const nodeHistoryItems = useMemo(
    () =>
      historyItems.filter(item => {
        const itemAgentId = String(item?.agent_id ?? "").trim();
        return !itemAgentId || itemAgentId === agentId;
      }),
    [agentId, historyItems]
  );
  const selectedHistoryItem = useMemo(
    () => historyItems.find(item => item.id === selectedRunId) ?? null,
    [historyItems, selectedRunId]
  );
  const recentSnapshotsErrorMessage = useMemo(
    () =>
      recentSnapshotsError
        ? extractErrorMessage(
            recentSnapshotsError,
            "Unable to load recent snapshots right now. Retry in a few seconds."
          )
        : "",
    [recentSnapshotsError]
  );
  const datasetsErrorMessage = useMemo(
    () =>
      datasetsError
        ? extractErrorMessage(datasetsError, "Unable to load saved datasets right now. Please retry.")
        : "",
    [datasetsError]
  );
  const expandedDatasetErrorMessage = useMemo(() => {
    if (expandedDatasetSnapshots404 || datasetSnapshots404) {
      return "This dataset is no longer available (it may have been deleted).";
    }
    if (expandedDatasetSnapshotsError) {
      return extractErrorMessage(
        expandedDatasetSnapshotsError,
        "Unable to load snapshots in this dataset right now. Please retry."
      );
    }
    if (datasetSnapshotsError) {
      return extractErrorMessage(
        datasetSnapshotsError,
        "Unable to resolve dataset snapshots for this run. Please retry."
      );
    }
    return "";
  }, [
    expandedDatasetSnapshots404,
    datasetSnapshots404,
    expandedDatasetSnapshotsError,
    datasetSnapshotsError,
  ]);

  const logsLimit = useMemo(() => {
    const n = Number(logsLimitInput);
    if (!Number.isFinite(n)) return 30;
    return Math.max(10, Math.min(200, Math.round(n)));
  }, [logsLimitInput]);

  const filteredRecentSnapshots = useMemo(() => {
    const items = Array.isArray(recentSnapshots) ? [...recentSnapshots] : [];

    if (logsStatusFilter !== "all") {
      const wantFail = logsStatusFilter === "failed";
      const target = wantFail ? "fail" : "pass";
      const filtered = items.filter(item => {
        const evalStatus = String(
          (item?.eval_checks_result as any)?.overall_status ??
            (item as any)?.status ??
            ""
        )
          .trim()
          .toLowerCase();
        if (!evalStatus) return false;
        if (wantFail) {
          return evalStatus === "fail" || evalStatus === "flaky";
        }
        return evalStatus === target;
      });
      items.splice(0, items.length, ...filtered);
    }

    items.sort((a, b) => {
      const aTime = a?.created_at ? new Date(String(a.created_at)).getTime() : 0;
      const bTime = b?.created_at ? new Date(String(b.created_at)).getTime() : 0;
      return logsSortMode === "oldest" ? aTime - bTime : bTime - aTime;
    });

    return items.slice(0, logsLimit);
  }, [logsLimit, logsSortMode, logsStatusFilter, recentSnapshots]);

  useEffect(() => {
    setDataPanelTab("logs");
    setRightPanelTab("results");
    setResultCaseFilter("all");
    setSettingsPanelOpen(false);
    setDetailAttemptView(null);
    setExpandedCaseIndex(null);
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  }, [
    agentId,
    setExpandedCaseIndex,
    setRepeatDropdownOpen,
    setSelectedRunId,
  ]);

  useEffect(() => {
    setResultCaseFilter("all");
    setDetailAttemptView(null);
  }, [result?.report_id]);

  const handleBack = () => {
    setViewMode("map");
    setAgentId("");
    setSelectedAgent(null);
    setDatasetIds([]);
    setSnapshotIds([]);
    setRunSnapshotIds([]);
    setRunDatasetIds([]);
    setExpandedDatasetId(null);
    setDetailAttemptView(null);
    setExpandedCaseIndex(null);
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  };

  const selectHistoryRun = (id: string) => {
    setSelectedRunId(id);
    setExpandedHistoryId?.(id);
  };

  const handleRepeatSelect = (runs: number) => {
    if (isValidating || activeJobId) return;
    if ((runs === 50 || runs === 100) && typeof window !== "undefined") {
      const approved = window.confirm(
        `${runs}x repeat runs are heavier and slower. Continue with the stability check?`
      );
      if (!approved) return;
    }
    setRepeatRuns(runs);
    setRepeatDropdownOpen(false);
  };

  const runLocked = isValidating || Boolean(activeJobId);

  const activeChecksCards = useMemo(() => {
    const configSrc = agentEvalData?.config as Record<string, unknown> | undefined;
    return runEvalElements.map((e: { name: string }) => {
      const id = e.name;
      const label =
        EVAL_CHECK_LABELS[id] ??
        id.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
      const checkConfig = configSrc?.[id] as Record<string, unknown> | undefined;
      const params = getEvalCheckParams(id, checkConfig);
      return { id, label, params };
    });
  }, [agentEvalData?.config, runEvalElements]);

  const toolsCount = Array.isArray(requestTools) ? requestTools.length : 0;
  const samplingTemperature =
    typeof (requestBody as any)?.temperature === "number"
      ? (requestBody as any).temperature
      : undefined;
  const samplingMaxTokens =
    typeof (requestBody as any)?.max_tokens === "number"
      ? (requestBody as any).max_tokens
      : undefined;
  const samplingTopP =
    typeof (requestBody as any)?.top_p === "number" ? (requestBody as any).top_p : undefined;
  const samplingSummary =
    samplingTemperature == null && samplingMaxTokens == null && samplingTopP == null
      ? "Using provider defaults"
      : [
          samplingTemperature != null ? `Temp ${samplingTemperature}` : null,
          samplingMaxTokens != null ? `Max ${samplingMaxTokens}` : null,
          samplingTopP != null ? `Top p ${samplingTopP}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const toolsSummary =
    toolsCount > 0
      ? `${toolsCount} tool${toolsCount === 1 ? "" : "s"} configured`
      : "No tools configured";
  const isPinnedAnthropic = (modelId: unknown) => /-\d{8}$/.test(String(modelId ?? "").trim());
  const overrideSummary = modelOverrideEnabled
    ? (() => {
        // This summary is displayed on the node card, so keep it compact.
        if (replayProvider === "anthropic") {
          return isPinnedAnthropic(newModel) ? "Pinned override" : "Custom override";
        }
        return "Override active";
      })()
    : "Using detected model";
  const lastRunStatusLabel = useMemo(() => {
    if (isValidating) return cancelRequested ? "Canceling" : "Running";
    if (runError) return "Failed";
    if (typeof result?.pass === "boolean") return result.pass ? "Passed" : "Failed";
    return "";
  }, [isValidating, cancelRequested, runError, result]);
  const originalPayloadPreview = useMemo(() => {
    const rawSource =
      baselinePayload ??
      (baselineSeedSnapshot?.payload &&
      typeof baselineSeedSnapshot.payload === "object" &&
      !Array.isArray(baselineSeedSnapshot.payload)
        ? (baselineSeedSnapshot.payload as Record<string, unknown>)
        : null) ??
      nodeBasePayload;
    const clean = sanitizePayloadForPreview(rawSource);
    try {
      return JSON.stringify(clean, null, 2);
    } catch {
      return "{}";
    }
  }, [baselinePayload, baselineSeedSnapshot, nodeBasePayload]);

  const rgDetails = agentId
    ? {
        provider: runDataProvider,
        model: runDataModel,
        prompt: String(requestSystemPrompt || runDataPrompt || "").trim(),
        toolsCount,
        activeChecks: runEvalElements.map((e: { name: string }) => e.name),
        activeChecksCards,
        strictnessLabel: REPLAY_THRESHOLD_PRESETS[thresholdPreset]?.label ?? thresholdPreset,
        failRateMax,
        flakyRateMax,
        config: {
          lastRunWallMs: result?.perf?.total_wall_ms ?? null,
          lastRunStatusLabel,
          configSourceLabel,
          selectedBaselineCount,
          selectedDataSummary,
          samplingSummary,
          toolsSummary,
          overrideSummary,
          originalPayloadPreview,
          runError,
          repeatRuns,
          repeatDropdownOpen,
          setRepeatDropdownOpen,
          repeatDropdownRef,
          REPEAT_OPTIONS,
          isHeavyRepeat,
          canRunValidate,
          keyBlocked,
          keyRegistrationMessage,
          isValidating,
          handleValidate,
          activeJobId,
          cancelRequested,
          handleCancel: handleCancelActiveJob,
          handleRepeatSelect,
          modelOverrideEnabled,
          openSettings: () => setSettingsPanelOpen(true),
        },
      }
    : null;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="absolute inset-0">
        <ReleaseGateMap
          agents={agents}
          agentsLoaded={agentsLoaded}
          onSelectAgent={onMapSelectAgent}
          projectName={projectName}
          selectedNodeId={agentId || null}
          rgDetails={rgDetails}
        />
      </div>
      <div className="absolute inset-0 z-[9999] pointer-events-none overflow-y-auto">
        <div className="absolute top-6 left-6 right-6 flex items-start justify-end pointer-events-none z-[10000]">
          <div className="mt-[70px] flex rounded-2xl border border-white/10 bg-[#1a1a1e]/90 p-1.5 shadow-2xl pointer-events-auto">
            <button
              onClick={() => setTab("validate")}
              data-testid="rg-main-tab-validate"
              className={clsx(
                "px-6 py-2 text-xs font-bold rounded-xl transition-all duration-300",
                tab === "validate"
                  ? "bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/30 shadow-[0_0_20px_rgba(217,70,239,0.2)]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              VALIDATE
            </button>
            <button
              onClick={() => setTab("history")}
              data-testid="rg-main-tab-history"
              className={clsx(
                "px-6 py-2 text-xs font-bold rounded-xl transition-all duration-300",
                tab === "history"
                  ? "bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              HISTORY
            </button>
          </div>
        </div>

        {tab === "validate" && agentId && (
          <ClientPortal>
            <RailwaySidePanel
              title={selectedAgent?.display_name || agentId}
              isOpen={true}
              onClose={handleBack}
              side="left"
              width={320}
              showCloseButton={false}
              className="pointer-events-auto"
              tabs={[
                { id: "logs", label: "Live Logs" },
                { id: "datasets", label: "Saved Data" },
              ]}
              tabTestIdPrefix="rg-data-tab"
              activeTab={dataPanelTab}
              onTabChange={id => setDataPanelTab(id as "logs" | "datasets")}
            >
              <div className="flex h-full flex-col">
                {dataPanelTab === "logs" && (
                  <div className="flex h-full flex-col" data-testid="rg-data-panel-logs">
                    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-black/30 px-4 py-3">
                      <span className="text-[11px] font-mono text-slate-400">
                        Total {filteredRecentSnapshots.length} Runs
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <div className="flex items-center rounded-xl border border-white/[0.08] bg-black/40 p-0.5">
                          {(["all", "failed", "passed"] as LogsStatusFilter[]).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setLogsStatusFilter(mode)}
                              className={clsx(
                                "rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-all",
                                logsStatusFilter === mode
                                  ? "bg-white/[0.12] text-white shadow-sm"
                                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                              )}
                            >
                              {mode === "all" ? "ALL" : mode === "failed" ? "FAILED" : "PASSED"}
                            </button>
                          ))}
                        </div>

                        <div className="group flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/40 pl-3 transition-colors focus-within:border-fuchsia-500/60">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 group-focus-within:text-fuchsia-400">
                            LIMIT
                          </span>
                          <input
                            type="number"
                            min={10}
                            max={200}
                            value={logsLimitInput}
                            onChange={e => setLogsLimitInput(e.target.value)}
                            className="w-[44px] bg-transparent py-1.5 text-center font-mono text-[12px] text-slate-200 outline-none"
                            title="Max recent runs to show (10–200)"
                          />
                        </div>

                        <div className="rounded-xl border border-white/[0.08] bg-black/40 transition-colors hover:border-white/20 focus-within:border-fuchsia-500/60">
                          <select
                            value={logsSortMode}
                            onChange={e => setLogsSortMode(e.target.value as "newest" | "oldest")}
                            className="cursor-pointer bg-transparent py-1.5 pl-3 pr-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300 outline-none"
                          >
                            <option value="newest" className="bg-[#18191e] text-slate-200">
                              Newest
                            </option>
                            <option value="oldest" className="bg-[#18191e] text-slate-200">
                              Oldest
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {recentSnapshotsError ? (
                        <div className="p-8 text-center" data-testid="rg-logs-state-error">
                          <div className="text-xs font-medium uppercase tracking-widest text-rose-400">
                            Unable to load recent snapshots
                          </div>
                          <div className="mt-2 text-[11px] text-slate-400">
                            {recentSnapshotsErrorMessage}
                          </div>
                          <button
                            type="button"
                            onClick={() => void mutateRecentSnapshots?.()}
                            className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/10"
                          >
                            Retry
                          </button>
                        </div>
                      ) : recentSnapshotsLoading && !recentSnapshots?.length ? (
                        <div className="p-8 text-center" data-testid="rg-logs-state-loading">
                          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
                            Loading recent snapshots
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            Fetching baseline logs for this node...
                          </div>
                        </div>
                      ) : filteredRecentSnapshots.length === 0 ? (
                        <div className="p-8 text-center" data-testid="rg-logs-state-empty">
                          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
                            No logs match this filter
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            Try ALL, increase LIMIT, or wait for more baseline traffic from Live View.
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[0.03]" data-testid="rg-logs-state-list">
                          {filteredRecentSnapshots.map(
                            (skinny: { id: string; trace_id?: string; created_at?: string }) => {
                              const full = baselineSnapshotsById.get(String(skinny.id)) as
                                | Record<string, unknown>
                                | undefined;
                              const snap = (full ?? skinny) as Record<string, unknown>;
                              const checked = runSnapshotIds.includes(String(skinny.id));
                              const failed = snapshotEvalFailed(full ?? null);

                              return (
                                <div
                                  key={skinny.id}
                                  data-testid={`rg-live-log-row-${skinny.id}`}
                                  className={clsx(
                                    "group transition-colors",
                                    checked ? "bg-fuchsia-500/5" : "hover:bg-white/[0.02]"
                                  )}
                                >
                                  <div
                                    className="flex cursor-pointer items-start gap-3 p-4"
                                    onClick={() =>
                                      setBaselineDetailSnapshot(snap as unknown as SnapshotForDetail)
                                    }
                                  >
                                    <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={runLocked}
                                        data-testid={`rg-live-log-checkbox-${skinny.id}`}
                                        onChange={() => {
                                          if (runLocked) return;
                                          const id = String(skinny.id);
                                          setRunSnapshotIds(prev =>
                                            prev.includes(id)
                                              ? prev.filter(x => x !== id)
                                              : [...prev, id]
                                          );
                                          setDataSource("recent");
                                          setRunDatasetIds([]);
                                        }}
                                        className="h-4 w-4 rounded border-white/10 bg-black/40 text-fuchsia-500"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[11px] font-bold text-slate-300">
                                          {formatDateTime(snap.created_at)}
                                        </span>
                                        <span
                                          className={clsx(
                                            "rounded border px-2 py-0.5 text-[9px] font-black uppercase",
                                            failed
                                              ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                          )}
                                        >
                                          {failed ? "FAIL" : "PASS"}
                                        </span>
                                      </div>
                                      <p className="line-clamp-2 text-[12px] leading-relaxed text-slate-300">
                                        {shortText(
                                          snap.user_message ?? snap.request_prompt ?? "—",
                                          "—",
                                          90
                                        )}
                                      </p>
                                      {Boolean(snap.trace_id) && (
                                        <p className="truncate text-[11px] text-slate-500">
                                          Trace {String(snap.trace_id)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {dataPanelTab === "datasets" && (
                  <div
                    className="flex-1 overflow-y-auto custom-scrollbar p-4"
                    data-testid="rg-data-panel-datasets"
                  >
                    {datasetsError ? (
                      <div
                        className="rounded-2xl border border-dashed border-rose-500/25 bg-rose-500/[0.06] p-8 text-center text-[12px] text-rose-100/90"
                        data-testid="rg-datasets-state-error"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-300">
                          Unable to load saved datasets
                        </div>
                        <div className="mt-2 text-[12px] text-slate-200">{datasetsErrorMessage}</div>
                        <button
                          type="button"
                          onClick={() => void mutateDatasets?.()}
                          className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    ) : datasetsLoading && !datasets?.length ? (
                      <div
                        className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[12px] text-slate-500"
                        data-testid="rg-datasets-state-loading"
                      >
                        Loading saved datasets...
                      </div>
                    ) : !datasets?.length ? (
                      <div
                        className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[12px] text-slate-500"
                        data-testid="rg-datasets-state-empty"
                      >
                        No saved datasets.
                        <div className="mt-2">
                          <Link
                            href={`/organizations/${orgId}/projects/${projectId}/live-view`}
                            className="text-fuchsia-400 hover:text-fuchsia-300"
                          >
                            Go to Live View (DATA tab)
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3" data-testid="rg-datasets-state-list">
                        {datasets.map(
                          (dataset: {
                            id: string;
                            label?: string;
                            snapshot_count?: number;
                            snapshot_ids?: unknown[];
                          }) => {
                            const id = dataset.id;
                            const label = dataset.label || id;
                            const count =
                              typeof dataset.snapshot_count === "number"
                                ? dataset.snapshot_count
                                : Array.isArray(dataset.snapshot_ids)
                                  ? dataset.snapshot_ids.length
                                  : 0;
                            const checked = runDatasetIds.includes(id);
                            const isExpanded = expandedDatasetId === id;
                            return (
                              <div
                                key={id}
                                className={clsx(
                                  "overflow-hidden rounded-[22px] border transition-all",
                                  checked
                                    ? "border-fuchsia-500/25 bg-fuchsia-500/8 shadow-[0_18px_40px_rgba(217,70,239,0.08)]"
                                    : "border-white/8 bg-white/[0.04]"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setExpandedDatasetId(isExpanded ? null : id)}
                                  className="flex w-full items-start gap-3 px-4 py-4 text-left"
                                >
                                  <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={runLocked}
                                      onChange={e => {
                                        e.stopPropagation();
                                        if (runLocked) return;
                                        setRunDatasetIds(prev =>
                                          prev.includes(id)
                                            ? prev.filter(x => x !== id)
                                            : [...prev, id]
                                        );
                                        setDataSource("datasets");
                                        setRunSnapshotIds([]);
                                      }}
                                      className="mt-0.5 h-4 w-4 rounded border-white/10 bg-black/40 text-fuchsia-500"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-[13px] font-semibold text-slate-100">
                                          {label}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-300">
                                          Saved baseline bundle for this node. Expand to inspect the
                                          snapshots inside.
                                        </div>
                                      </div>
                                      <div className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-slate-200">
                                        {count} snapshots
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronDown
                                    className={clsx(
                                      "mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform",
                                      isExpanded && "rotate-180"
                                    )}
                                  />
                                </button>

                                {isExpanded && (
                                  <div className="px-4 pb-4">
                                    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04]">
                                      {(expandedDatasetSnapshotsLoading || datasetSnapshotsLoading) &&
                                      expandedDatasetId === id ? (
                                        <div className="px-4 py-4 text-sm text-slate-500">
                                          Loading snapshots...
                                        </div>
                                      ) : expandedDatasetErrorMessage ? (
                                        <div className="px-4 py-4 text-sm text-rose-200">
                                          <div>{expandedDatasetErrorMessage}</div>
                                          {!(expandedDatasetSnapshots404 || datasetSnapshots404) && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                void mutateExpandedDatasetSnapshots?.();
                                                void mutateDatasetSnapshots?.();
                                              }}
                                              className="mt-3 inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition-colors"
                                            >
                                              Retry
                                            </button>
                                          )}
                                        </div>
                                      ) : expandedDatasetSnapshots.length === 0 ? (
                                        <div className="px-4 py-4 text-sm text-slate-500">
                                          No snapshots stored in this dataset.
                                        </div>
                                      ) : (
                                        expandedDatasetSnapshots.map(snapshot => (
                                          <button
                                            key={String(snapshot.id)}
                                            type="button"
                                            onClick={() =>
                                              setBaselineDetailSnapshot(
                                                snapshot as unknown as SnapshotForDetail
                                              )
                                            }
                                            className="flex w-full items-start justify-between gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.05]"
                                          >
                                            <div className="min-w-0 flex-1">
                                              <div className="truncate text-[13px] font-medium text-slate-100">
                                                {shortText(
                                                  snapshot.user_message ??
                                                    snapshot.request_prompt ??
                                                    "—",
                                                  "—",
                                                  88
                                                )}
                                              </div>
                                              <div className="mt-1 text-[11px] text-slate-400">
                                                {formatDateTime(snapshot.created_at)}
                                              </div>
                                            </div>
                                            <div className="shrink-0 text-[11px] text-slate-500">
                                              {String(snapshot.trace_id ?? "").slice(0, 12) ||
                                                "trace"}
                                            </div>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </RailwaySidePanel>

            <RailwaySidePanel
              title=""
              isOpen={true}
              onClose={handleBack}
              side="right"
              width={320}
              showCloseButton={true}
              className="pointer-events-auto"
              tabs={[
                { id: "results", label: "Results" },
                { id: "history", label: "History" },
              ]}
              tabTestIdPrefix="rg-right-tab"
              activeTab={rightPanelTab}
              onTabChange={id => {
                const next = id as "results" | "history";
                setRightPanelTab(next);
                if (next === "history" && !selectedRunId && nodeHistoryItems[0]?.id) {
                  selectHistoryRun(String(nodeHistoryItems[0].id));
                }
              }}
            >
              <div className="flex h-full flex-col overflow-y-auto custom-scrollbar">
                {rightPanelTab === "results" && (
                  <div className="flex-1 space-y-4 p-4">
                    {!result ? (
                      <div className="flex flex-col items-center justify-center py-14 text-center opacity-70">
                        <Activity className="mb-4 h-8 w-8 text-slate-400" />
                        <div className="text-sm font-black uppercase text-slate-300">
                          Awaiting run
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Choose baseline data, adjust the settings below the node, then press
                          Start.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div
                          className={clsx(
                            "rounded-[24px] border px-4 py-3",
                            result.pass
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                              : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                          )}
                        >
                          <div className="text-[10px] font-black uppercase tracking-[0.18em]">
                            Current gate result
                          </div>
                          <div className="mt-1 text-lg font-black">
                            {result.pass ? "Passed" : "Failed"}
                          </div>
                          {typeof result.summary === "string" && result.summary.trim() && (
                            <p className="mt-2 text-sm leading-relaxed text-white/80">
                              {result.summary}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <MetricTile
                            label="Failure rate"
                            value={percentFromRate(result.fail_rate)}
                            tone={result.pass ? "success" : "danger"}
                          />
                          <MetricTile
                            label="Flaky rate"
                            value={percentFromRate(result.flaky_rate)}
                          />
                          <MetricTile label="Inputs" value={Number(result.total_inputs ?? 0)} />
                          <MetricTile
                            label="Repeats"
                            value={Number(result.repeat_runs ?? repeatRuns)}
                          />
                        </div>
                        {result?.perf && typeof result.perf === "object" && (
                          <div className="grid grid-cols-2 gap-2">
                            <MetricTile
                              label="Total runtime"
                              value={formatDurationMs((result.perf as any).total_wall_ms)}
                            />
                            <MetricTile
                              label="Avg repeat"
                              value={formatDurationMs((result.perf as any).avg_attempt_wall_ms)}
                            />
                          </div>
                        )}

                        {Array.isArray(result.failure_reasons) &&
                          result.failure_reasons.length > 0 && (
                            <div className="rounded-[24px] border border-white/8 bg-black/30 p-4">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                Why it failed
                              </div>
                              <div className="mt-3 space-y-2">
                                {result.failure_reasons
                                  .slice(0, 6)
                                  .map((reason: string, idx: number) => (
                                    <div
                                      key={`${reason}-${idx}`}
                                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-slate-200"
                                    >
                                      {reason}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                        {!result.pass && whatToFixHints.length > 0 && (
                          <div className="rounded-[24px] border border-amber-500/25 bg-amber-500/10 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                              What to fix first
                            </div>
                            <p className="mt-1 text-[11px] text-amber-100/80">
                              Top recurring issues across failed or flaky inputs in this run.
                            </p>
                            <div className="mt-3 space-y-2">
                              {whatToFixHints.map((hint, idx) => (
                                <div
                                  key={hint.key}
                                  className="rounded-2xl border border-amber-500/20 bg-black/20 px-3 py-2.5"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 text-sm font-semibold text-amber-50">
                                      {idx + 1}. {hint.label}
                                    </div>
                                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200">
                                      {hint.count}x
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs leading-relaxed text-amber-100/85">
                                    {hint.hint}
                                  </p>
                                  {hint.sample && (
                                    <p className="mt-1 line-clamp-2 text-[11px] text-amber-100/65">
                                      Example: {hint.sample}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                              Per-input breakdown
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setResultCaseFilter("all")}
                                  className={clsx(
                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] transition",
                                    resultCaseFilter === "all"
                                      ? "bg-white/10 text-white"
                                      : "text-slate-400 hover:text-slate-200"
                                  )}
                                >
                                  All {resultCases.length}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResultCaseFilter("failed")}
                                  className={clsx(
                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] transition",
                                    resultCaseFilter === "failed"
                                      ? "bg-rose-500/20 text-rose-200"
                                      : "text-slate-400 hover:text-slate-200"
                                  )}
                                >
                                  Failed only {failedCaseCount}
                                </button>
                              </div>
                              {nodeHistoryItems.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRightPanelTab("history");
                                    if (!selectedRunId && nodeHistoryItems[0]?.id) {
                                      selectHistoryRun(String(nodeHistoryItems[0].id));
                                    }
                                  }}
                                  data-testid="rg-view-history-btn"
                                  className="text-[11px] font-semibold text-slate-300 hover:text-white"
                                >
                                  View history
                                </button>
                              )}
                            </div>
                          </div>

                          {visibleResultCases.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-500">
                              {resultCaseFilter === "failed"
                                ? "No failed or flaky inputs in this run."
                                : "No per-input result rows returned for this run."}
                            </div>
                          ) : (
                            visibleResultCases.map(({ run, caseIndex: idx }: VisibleResultCase) => {
                            const attempts = Array.isArray(run?.attempts) ? run.attempts : [];
                            const baselineSnapshotForRun =
                              (baselineSnapshotsById.get(String(run?.snapshot_id ?? "")) as
                                | Record<string, unknown>
                                | undefined) ??
                              (recentSnapshots.find(
                                s => String((s as Record<string, unknown>)?.id ?? "") === String(run?.snapshot_id ?? "")
                              ) as Record<string, unknown> | undefined) ??
                              null;
                            const caseStatusRaw = String(
                              run?.case_status ?? (run?.pass ? "pass" : "fail")
                            )
                              .trim()
                              .toLowerCase();
                            const caseIsPass =
                              caseStatusRaw === "pass" ||
                              (caseStatusRaw !== "fail" &&
                                caseStatusRaw !== "flaky" &&
                                Boolean(run?.pass));
                            const caseIsFlaky = caseStatusRaw === "flaky";
                            const totalAttempts =
                              attempts.length || Number(result.repeat_runs ?? repeatRuns) || 1;
                            const passRatioFallback = Number((run?.summary as any)?.pass_ratio);
                            const passedAttempts = attempts.length
                              ? attempts.filter((attempt: any) => Boolean(attempt?.pass)).length
                              : Number.isFinite(passRatioFallback)
                                ? Math.max(
                                    0,
                                    Math.min(totalAttempts, Math.round(passRatioFallback * totalAttempts))
                                  )
                                : caseIsPass
                                  ? totalAttempts
                                  : 0;
                            const caseStatus = caseIsPass
                              ? "PASS"
                              : caseIsFlaky
                                ? "FLAKY"
                                : "FAIL";
                            const isExpanded = expandedCaseIndex === idx;

                            return (
                              <div
                                key={idx}
                                data-testid={`rg-result-case-${idx}`}
                                className={clsx(
                                  "overflow-hidden rounded-[24px] border",
                                  caseIsPass
                                    ? "border-emerald-500/20 bg-emerald-500/5"
                                    : caseIsFlaky
                                      ? "border-amber-500/25 bg-amber-500/7"
                                    : "border-rose-500/20 bg-rose-500/5"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedCaseIndex(isExpanded ? null : idx);
                                  }}
                                  data-testid={`rg-result-case-toggle-${idx}`}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                      Input {idx + 1}
                                    </div>
                                    <div
                                      className="mt-1 text-sm font-semibold text-white"
                                      data-testid={`rg-result-case-ratio-${idx}`}
                                    >
                                      {passedAttempts}/{totalAttempts} passed
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span
                                      data-testid={`rg-result-case-status-${idx}`}
                                      data-case-status={caseStatus}
                                      className={clsx(
                                        "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase",
                                        caseIsPass
                                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                          : caseIsFlaky
                                            ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                                          : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                                      )}
                                    >
                                      {caseStatus}
                                    </span>
                                    <ChevronDown
                                      className={clsx(
                                        "h-4 w-4 text-slate-500 transition-transform",
                                        isExpanded && "rotate-180"
                                      )}
                                    />
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="space-y-3 border-t border-white/8 p-4">
                                    {Array.isArray(run?.failure_reasons) &&
                                      run.failure_reasons.length > 0 && (
                                        <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
                                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                            Case reasons
                                          </div>
                                          <div className="mt-2 space-y-2">
                                            {run.failure_reasons
                                              .slice(0, 4)
                                              .map((reason: string, reasonIdx: number) => (
                                                <div
                                                  key={`${reason}-${reasonIdx}`}
                                                  className="text-sm leading-relaxed text-slate-200"
                                                >
                                                  {reason}
                                                </div>
                                              ))}
                                          </div>
                                        </div>
                                      )}

                                    <div className="space-y-2">
                                      {attempts.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-500">
                                          No per-attempt detail stored for this input.
                                        </div>
                                      ) : (
                                        attempts.map((attempt: any, attemptIdx: number) => {
                                          return (
                                            <button
                                              key={attemptIdx}
                                              type="button"
                                              onClick={() => {
                                                setDetailAttemptView({
                                                  attempt,
                                                  caseIndex: idx,
                                                  attemptIndex: attemptIdx,
                                                  baselineSnapshot: baselineSnapshotForRun,
                                                });
                                              }}
                                              className={clsx(
                                                "flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                                                "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"
                                              )}
                                            >
                                              <div className="min-w-0">
                                                <div className="text-xs font-semibold text-slate-100">
                                                  Attempt {attemptIdx + 1}
                                                </div>
                                                <div className="mt-1 truncate text-[11px] text-slate-400">
                                                  {shortText(
                                                    attempt?.trace_id ?? "No trace id",
                                                    "No trace id",
                                                    54
                                                  )}
                                                </div>
                                              </div>
                                              <span
                                                className={clsx(
                                                  "rounded-full border px-2 py-1 text-[10px] font-black uppercase",
                                                  attempt?.pass
                                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                                    : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                                                )}
                                              >
                                                {attempt?.pass ? "PASS" : "FAIL"}
                                              </span>
                                            </button>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {rightPanelTab === "history" && (
                  <div className="flex-1 space-y-4 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Experiment history
                        </div>
                        <div className="text-sm font-semibold text-white">
                          Retained runs for this node
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => mutateHistory()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Refresh
                      </button>
                    </div>

                    {historyLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                          <div
                            key={i}
                            className="h-16 rounded-2xl border border-white/5 bg-white/5 animate-pulse"
                          />
                        ))}
                      </div>
                    ) : nodeHistoryItems.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                        <Flag className="mx-auto mb-2 h-10 w-10 text-slate-600" />
                        <p className="text-sm text-slate-500">
                          No retained history yet for this node.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {nodeHistoryItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectHistoryRun(String(item.id))}
                            data-testid={`rg-node-history-row-${item.id}`}
                            data-run-status={String(item.status || "").toLowerCase()}
                            className={clsx(
                              "flex w-full items-center justify-between gap-3 rounded-[22px] border px-4 py-3 text-left transition",
                              selectedRunId === item.id
                                ? "border-fuchsia-500/30 bg-fuchsia-500/10"
                                : "border-white/8 bg-black/20 hover:bg-white/[0.05]"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                                {item.status === "pass" ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                ) : (
                                  <ShieldX className="h-4 w-4 text-rose-400" />
                                )}
                                <span
                                  className={
                                    item.status === "pass" ? "text-emerald-300" : "text-rose-300"
                                  }
                                >
                                  {item.status === "pass" ? "Passed" : "Failed"}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-[11px] text-slate-400">
                                {shortText(item.trace_id, "No trace id", 54)}
                              </div>
                            </div>
                            <div className="shrink-0 text-[11px] text-slate-500">
                              {formatDateTime(item.created_at)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedHistoryItem ? (
                      <HistoryDetailCard
                        item={selectedHistoryItem}
                        report={selectedRunReport}
                        onClose={() => setSelectedRunId(null)}
                      />
                    ) : nodeHistoryItems.length > 0 ? (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                        <p className="text-sm text-slate-500">
                          Select a run to inspect thresholds, inputs, and violations.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </RailwaySidePanel>
          </ClientPortal>
        )}

        {detailAttemptView && (
          <ClientPortal>
            <AttemptDetailOverlay
              open={Boolean(detailAttemptView)}
              onClose={() => setDetailAttemptView(null)}
              inputIndex={detailAttemptView.caseIndex}
              attemptIndex={detailAttemptView.attemptIndex}
              attempt={detailAttemptView.attempt}
              baselineSnapshot={detailAttemptView.baselineSnapshot}
            />
          </ClientPortal>
        )}

        <ReleaseGateConfigPanel
          isOpen={settingsPanelOpen && !!agentId}
          onClose={() => setSettingsPanelOpen(false)}
        />

        {tab === "history" && (
          <div className="mx-6 mt-24 space-y-6 rounded-3xl border border-white/5 bg-[#111216] p-7 shadow-xl pointer-events-auto">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={historyStatus}
                onChange={e => {
                  setHistoryStatus(e.target.value as "all" | "pass" | "fail");
                  setHistoryOffset(0);
                }}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">All</option>
                <option value="pass">Passed</option>
                <option value="fail">Failed</option>
              </select>
              <input
                value={historyTraceId}
                onChange={e => {
                  setHistoryTraceId(e.target.value);
                  setHistoryOffset(0);
                }}
                placeholder="Filter by trace ID"
                className="w-48 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
              />
              <button
                onClick={() => mutateHistory()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-16 rounded-lg border border-white/5 bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : historyItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <Flag className="mx-auto mb-2 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">No validation history yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-2">
                  {historyItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectHistoryRun(String(item.id))}
                      data-testid={`rg-main-history-row-${item.id}`}
                      data-run-status={String(item.status || "").toLowerCase()}
                      className={clsx(
                        "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left",
                        selectedRunId === item.id
                          ? "border-fuchsia-500/50 bg-fuchsia-500/10"
                          : "border-white/10 bg-black/20 hover:bg-white/5"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                        {item.status === "pass" ? (
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <ShieldX className="h-4 w-4 text-rose-400" />
                        )}
                        <span
                          className={item.status === "pass" ? "text-emerald-400" : "text-rose-400"}
                        >
                          {item.status === "pass" ? "Passed" : "Failed"}
                        </span>
                        <span className="truncate text-slate-400">· {item.trace_id}</span>
                      </div>
                      <div className="text-xs text-slate-400">{item.created_at || "-"}</div>
                    </button>
                  ))}
                </div>
                <div className="lg:col-span-2">
                  {selectedHistoryItem ? (
                    <HistoryDetailCard
                      item={selectedHistoryItem}
                      report={selectedRunReport}
                      onClose={() => setSelectedRunId(null)}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                      <p className="text-sm text-slate-500">
                        Select a run from the list to see detail.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs text-slate-400">
              <span>
                {historyTotal} {historyTotal === 1 ? "record" : "records"}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={historyOffset <= 0}
                  onClick={() =>
                    setHistoryOffset((value: number) => Math.max(0, value - historyLimit))
                  }
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={historyOffset + historyLimit >= historyTotal}
                  onClick={() => setHistoryOffset((value: number) => value + historyLimit)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {baselineDetailSnapshot && (
          <ClientPortal>
            <AnimatePresence>
              <SnapshotDetailModal
                snapshot={baselineDetailSnapshot}
                onClose={() => setBaselineDetailSnapshot(null)}
                overlayZIndex={10000}
                policyState={{ status: "idle" }}
                evalRows={(() => {
                  const snap = baselineDetailSnapshot as unknown as Record<string, unknown> | null;
                  const checks = snap?.eval_checks_result;
                  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return [];
                  return Object.entries(checks).map(([id, status]) => ({
                    id,
                    status: String(status),
                  }));
                })()}
                evalEnabled={true}
                evalContextLabel={(() => {
                  const snap = baselineDetailSnapshot as unknown as Record<string, unknown>;
                  const cur = (agentEvalData as Record<string, unknown> | undefined)
                    ?.current_eval_config_version as string | undefined;
                  const snapVer = snap?.eval_config_version as string | undefined;
                  const stale = cur && snapVer && snapVer !== cur;
                  return stale
                    ? "Eval result from snapshot capture time. Eval config has changed since then."
                    : "Eval result from snapshot capture time.";
                })()}
              />
            </AnimatePresence>
          </ClientPortal>
        )}
      </div>
    </div>
  );
}
