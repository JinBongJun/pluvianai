"use client";

/**
 * Release Gate run / attempt UI. Tool timeline rows mirror Live View (`LiveViewToolTimelineRow`);
 * keep redaction and empty-state copy aligned with `SnapshotDetailModal` / `ToolTimelinePanel`
 * (see docs/live-view-context-privacy-plan.md).
 */
import React, { useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Wrench,
} from "lucide-react";
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
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import type { LiveViewToolTimelineRow } from "@/lib/api/live-view";

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
  tool_grounding: "Tool Result Grounding",
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

/** Roll up tool_grounding across attempts for one input (case). */
function summarizeGroundingForCase(run: any): {
  rollup: "pass" | "fail" | "na" | null;
  semantic: "pass" | "fail" | "unavailable" | null;
} {
  const attempts = Array.isArray(run?.attempts) ? run.attempts : [];
  if (attempts.length === 0) return { rollup: null, semantic: null };

  const groundingStatuses: string[] = [];
  const semanticStatuses: string[] = [];

  for (const attempt of attempts) {
    const checks = attempt?.signals?.checks;
    const g =
      checks && typeof checks === "object" && !Array.isArray(checks)
        ? String((checks as Record<string, unknown>).tool_grounding ?? "")
            .trim()
            .toLowerCase()
        : "";
    if (g) groundingStatuses.push(g);

    const detail = attempt?.signals?.details?.tool_grounding;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const s = String((detail as Record<string, unknown>).semantic_status ?? "")
        .trim()
        .toLowerCase();
      if (s) semanticStatuses.push(s);
    }
  }

  if (groundingStatuses.length === 0) return { rollup: null, semantic: null };

  let rollup: "pass" | "fail" | "na" | null = null;
  if (groundingStatuses.every(s => s === "not_applicable")) {
    rollup = "na";
  } else if (groundingStatuses.some(s => s === "fail")) {
    rollup = "fail";
  } else if (groundingStatuses.some(s => s === "pass")) {
    rollup = "pass";
  }

  let semantic: "pass" | "fail" | "unavailable" | null = null;
  if (semanticStatuses.length > 0) {
    if (semanticStatuses.some(s => s === "fail")) semantic = "fail";
    else if (semanticStatuses.some(s => s === "pass")) semantic = "pass";
    else if (semanticStatuses.every(s => s === "unavailable")) semantic = "unavailable";
  }

  return { rollup, semantic };
}

function summarizeRunToolGroundingFromCases(resultCases: any[]): {
  withTools: number;
  pass: number;
  fail: number;
  semanticOk: number;
  semanticOff: number;
} | null {
  if (!Array.isArray(resultCases) || resultCases.length === 0) return null;
  let withTools = 0;
  let pass = 0;
  let fail = 0;
  let semanticOk = 0;
  let semanticOff = 0;

  for (const run of resultCases) {
    const g = summarizeGroundingForCase(run);
    if (!g.rollup || g.rollup === "na") continue;
    withTools++;
    if (g.rollup === "pass") pass++;
    else fail++;
    if (g.semantic === "pass") semanticOk++;
    if (g.semantic === "unavailable") semanticOff++;
  }

  if (withTools === 0) return null;
  return { withTools, pass, fail, semanticOk, semanticOff };
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

type AttemptDetailMainTab = "summary" | "comparison" | "debug";

function AttemptDetailOverlay({
  open,
  onClose,
  inputIndex,
  attempts,
  initialAttemptIndex = 0,
  baselineSnapshot,
}: {
  open: boolean;
  onClose: () => void;
  inputIndex: number;
  attempts: any[];
  initialAttemptIndex?: number;
  baselineSnapshot: Record<string, unknown> | null;
}) {
  const [detailMainTab, setDetailMainTab] = useState<AttemptDetailMainTab>("summary");
  const [inputExpanded, setInputExpanded] = useState(false);
  const [showRemovedDiffLines, setShowRemovedDiffLines] = useState(false);
  const [navIndex, setNavIndex] = useState(0);

  const attemptCount = Array.isArray(attempts) ? attempts.length : 0;
  const maxNav = Math.max(0, attemptCount - 1);
  const safeInitial = Math.min(Math.max(0, initialAttemptIndex), maxNav);

  const [failedOnly, setFailedOnly] = useState(false);

  useEffect(() => {
    if (open) {
      setDetailMainTab("summary");
      setInputExpanded(false);
      setShowRemovedDiffLines(false);
      setNavIndex(safeInitial);
      setFailedOnly(false);
    }
  }, [open, inputIndex, safeInitial, attemptCount]);

  const attempt = attemptCount > 0 ? attempts[Math.min(Math.max(0, navIndex), maxNav)] : null;

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

  const formatSignalValue = (id: string, raw: unknown, pass: boolean): React.ReactNode => {
    const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const status = String(d.status ?? "").trim().toLowerCase();
    if (!status) return null;

    if (id === "length") {
      const failRatio = Number(d.fail_ratio);
      const actualChars = Number(d.actual_chars);
      const baselineLen = Number(d.baseline_len);
      if (!Number.isFinite(baselineLen) || !Number.isFinite(actualChars)) return null;
      
      const maxAllowed = Math.round(baselineLen * (1 + (Number.isFinite(failRatio) ? failRatio : 0.5)));
      const pct = Math.min(100, Math.max(0, (actualChars / maxAllowed) * 100));
      
      return (
        <div className="mt-2 space-y-1.5 w-full max-w-md">
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400">
            <span>Base {baselineLen} chars</span>
            <span className={pass ? "text-emerald-400" : "text-rose-400"}>Actual {actualChars} chars</span>
            <span>Max {maxAllowed}</span>
          </div>
          <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden flex">
            <div className={clsx("h-full transition-all", pass ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }

    if (id === "latency") {
      const failMs = Number(d.fail_ms);
      const actualMs = Number(d.actual_ms);
      if (!Number.isFinite(failMs) || !Number.isFinite(actualMs)) return null;
      
      const pct = Math.min(100, Math.max(0, (actualMs / failMs) * 100));
      return (
        <div className="mt-2 space-y-1.5 w-full max-w-md">
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400">
            <span>Actual {actualMs}ms</span>
            <span className={pass ? "text-slate-400" : "text-rose-400"}>Limit {failMs}ms</span>
          </div>
          <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden flex">
            <div className={clsx("h-full transition-all", pass ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    
    return null;
  };

  const formatSignalWhy = (id: string, raw: unknown): string => {
    const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!d) return "Evidence unavailable for this check.";
    const status = String(d.status ?? "").trim().toLowerCase();
    const statusLead =
      status === "fail"
        ? "Check failed."
        : status === "pass"
          ? "Check passed."
          : status === "not_applicable"
            ? "Not applicable for this run."
            : "Status captured.";
    const toNum = (value: unknown): number | null => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    if (id === "empty") {
      const actualChars = toNum(d.actual_chars);
      const minChars = toNum(d.min_chars);
      if (actualChars !== null && minChars !== null) {
        return `Empty check: actual ${Math.round(actualChars)} chars (min ${Math.round(minChars)} chars).`;
      }
      return `${statusLead} Evidence unavailable for this check.`;
    }

    if (id === "latency") {
      const actualMs = toNum(d.actual_ms);
      const failMs = toNum(d.fail_ms);
      if (actualMs !== null && failMs !== null) {
        return `Latency ${Math.round(actualMs)}ms (limit ${Math.round(failMs)}ms).`;
      }
      return `${statusLead} Evidence unavailable for this check.`;
    }

    if (id === "status_code") {
      const actualStatus = toNum(d.actual_status);
      const failFrom = toNum(d.fail_from);
      if (actualStatus !== null && failFrom !== null) {
        return `HTTP status ${Math.round(actualStatus)} (fails from ${Math.round(failFrom)}).`;
      }
      return `${statusLead} Evidence unavailable for this check.`;
    }

    if (id === "refusal") {
      if (typeof d.matched === "boolean") {
        return `Refusal pattern ${d.matched ? "detected" : "not detected"}.`;
      }
      return `${statusLead} Evidence unavailable for this check.`;
    }

    if (id === "json") {
      const mode = String(d.mode ?? "default").trim() || "default";
      const checked = typeof d.checked === "boolean" ? (d.checked ? "yes" : "no") : "unknown";
      const parsed =
        typeof d.parsed_ok === "boolean" ? (d.parsed_ok ? "ok" : "failed") : "unknown";
      return `JSON validity: mode ${mode}, checked ${checked}, parsed ${parsed}.`;
    }

    if (id === "length") {
      const baselineLen = toNum(d.baseline_len);
      const actualChars = toNum(d.actual_chars);
      const ratio = toNum(d.ratio);
      if (baselineLen !== null && actualChars !== null && ratio !== null) {
        return `Output length drift ${Math.abs(ratio * 100).toFixed(1)}% (baseline ${Math.round(baselineLen)}, actual ${Math.round(actualChars)}).`;
      }
      return `${statusLead} Evidence unavailable for this check.`;
    }

    if (id === "repetition") {
      const maxRepeats = toNum(d.max_line_repeats);
      const failRepeats = toNum(d.fail_line_repeats);
      if (maxRepeats !== null && failRepeats !== null) {
        return `Repetition max ${Math.round(maxRepeats)} line repeats (fails at ${Math.round(failRepeats)}).`;
      }
      return `${statusLead} Evidence unavailable for this check.`;
    }

    if (id === "required" || id === "format" || id === "leakage" || id === "tool") {
      return `${statusLead} Status available, detailed evidence unavailable for this check.`;
    }

    if (id === "tool_grounding") {
      const toolCalls = toNum(d.tool_calls);
      const toolResults = toNum(d.tool_results);
      const groundedRows = toNum(d.grounded_rows);
      const evaluatedRows = toNum(d.evaluated_rows);
      const coverageRatio = toNum(d.coverage_ratio);
      const loopStatus = String(d.loop_status ?? "").trim() || "unknown";
      const responsePresent =
        typeof d.response_present === "boolean"
          ? d.response_present
            ? "yes"
            : "no"
          : "unknown";
      const matchedTokens = Array.isArray(d.matched_tokens)
        ? (d.matched_tokens as unknown[]).map(v => String(v ?? "").trim()).filter(Boolean)
        : [];
      const matchedFacts = Array.isArray(d.matched_facts)
        ? (d.matched_facts as unknown[]).map(v => String(v ?? "").trim()).filter(Boolean)
        : [];
      const semanticStatus = String(d.semantic_status ?? "").trim().toLowerCase();
      const semanticReason = String(d.semantic_reason ?? "").trim();
      const semanticConfidence = String(d.semantic_confidence ?? "").trim();
      const semanticModel = String(d.semantic_model ?? "").trim();
      const reason = String(d.reason ?? "").trim();
      const coverageLabel =
        coverageRatio !== null ? `${Math.round(coverageRatio * 100)}%` : "unknown";
      let summary = `Tool grounding: calls ${toolCalls ?? 0}, results ${toolResults ?? 0}, matched ${groundedRows ?? 0}/${evaluatedRows ?? toolResults ?? 0}, coverage ${coverageLabel}, loop ${loopStatus}, final response ${responsePresent}.`;
      if (matchedTokens.length > 0) {
        summary += ` Matched tokens: ${matchedTokens.slice(0, 4).join(", ")}.`;
      }
      if (matchedFacts.length > 0) {
        summary += ` Semantic matches: ${matchedFacts.slice(0, 2).join("; ")}.`;
      }
      if (semanticStatus && semanticStatus !== "not_needed") {
        summary += ` Semantic judge ${semanticStatus}.`;
        if (semanticConfidence) {
          summary += ` Confidence ${semanticConfidence}.`;
        }
        if (semanticModel) {
          summary += ` Model ${semanticModel}.`;
        }
        if (semanticReason) {
          summary += ` ${semanticReason}`;
        }
      }
      return reason ? `${summary} ${reason}` : summary;
    }

    return `${statusLead} Evidence unavailable for this check.`;
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
          tool_execution_summary: attempt?.tool_execution_summary ?? {},
          tool_evidence: Array.isArray(attempt?.tool_evidence) ? attempt.tool_evidence : [],
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
  const candidateResponseStatus = String((candidateSnapshot as any)?.response_preview_status ?? "")
    .trim()
    .toLowerCase();
  const toolExecutionSummary =
    attempt?.tool_execution_summary &&
    typeof attempt.tool_execution_summary === "object" &&
    !Array.isArray(attempt.tool_execution_summary)
      ? (attempt.tool_execution_summary as Record<string, unknown>)
      : null;
  const toolEvidenceRows = Array.isArray(attempt?.tool_evidence)
    ? (attempt.tool_evidence as Array<Record<string, unknown>>)
    : [];
  /**
   * Maps Gate `tool_evidence` (replay service) into `LiveViewToolTimelineRow` for shared `ToolTimelinePanel`.
   * Live View snapshot GET applies `redact_secrets` in the API; Gate rows use server-built previews here.
   * Keep empty I/O copy + provenance labels aligned with `ToolTimelinePanel` / privacy plan §12.3.
   */
  const gateToolTimelineRows = useMemo((): LiveViewToolTimelineRow[] => {
    return toolEvidenceRows.map((row, idx) => {
      const exec = String(row.execution_source ?? row.status ?? "").toLowerCase();
      const stepType = exec === "recorded" ? "tool_result" : "tool_call";
      const argsP = row.arguments_preview;
      const resP = row.result_preview;
      const argsObj: Record<string, unknown> = {};
      if (typeof argsP === "string" && argsP.trim()) argsObj.arguments_preview = argsP;
      const cid = row.call_id;
      if (cid != null && String(cid).trim()) argsObj.call_id = String(cid).trim();
      const trObj: Record<string, unknown> | null =
        typeof resP === "string" && resP.trim() ? { result_preview: resP } : null;
      return {
        step_order: Number(row.order) || idx + 1,
        step_type: stepType,
        tool_name: String(row.name ?? ""),
        tool_args: argsObj,
        tool_result: trObj,
        provenance: exec === "recorded" ? "trajectory" : "payload",
        execution_source: exec,
        tool_result_source: String(row.tool_result_source ?? "").toLowerCase(),
        match_tier: String(row.match_tier ?? "").toLowerCase(),
      };
    });
  }, [toolEvidenceRows]);
  const toolCountsRaw =
    toolExecutionSummary &&
    typeof toolExecutionSummary.counts === "object" &&
    !Array.isArray(toolExecutionSummary.counts)
      ? (toolExecutionSummary.counts as Record<string, unknown>)
      : {};
  const toolTotalCalls = Number(toolCountsRaw.total_calls ?? toolEvidenceRows.length ?? 0) || 0;
  const toolExecutedCount = Number(toolCountsRaw.executed ?? 0) || 0;
  const toolSimulatedCount = Number(toolCountsRaw.simulated ?? 0) || 0;
  const toolRecordedCount = Number(toolCountsRaw.recorded ?? 0) || 0;
  const toolSkippedCount = Number(toolCountsRaw.skipped ?? 0) || 0;
  const toolFailedCount = Number(toolCountsRaw.failed ?? 0) || 0;
  const toolResultCountFromSummary = Number(toolCountsRaw.tool_results ?? 0) || 0;
  const toolEvidenceDetail =
    String(toolExecutionSummary?.detail ?? "").trim() ||
    (toolTotalCalls > 0
      ? "Tool calls were detected during replay."
      : "No tool calls were detected for this attempt.");
  const toolEvidenceStatus = String(toolExecutionSummary?.status ?? "").trim().toLowerCase();
  const replayObj =
    attempt?.replay && typeof attempt.replay === "object" && !Array.isArray(attempt.replay)
      ? (attempt.replay as Record<string, unknown>)
      : {};
  const toolLoopStatus =
    String(
      replayObj.tool_loop_status ??
        (candidateSnapshot as any)?.tool_loop_status ??
        "not_needed"
    ).trim() || "not_needed";
  const toolLoopRounds =
    Number(replayObj.tool_loop_rounds ?? (candidateSnapshot as any)?.tool_loop_rounds ?? 0) || 0;
  const toolLoopEvents = Array.isArray(
    replayObj.tool_loop_events ?? (candidateSnapshot as any)?.tool_loop_events
  )
    ? ((replayObj.tool_loop_events ??
        (candidateSnapshot as any)?.tool_loop_events) as Array<Record<string, unknown>>)
    : [];
  const flattenedToolLoopRows = toolLoopEvents
    .flatMap(ev =>
      Array.isArray(ev?.tool_rows)
        ? (ev.tool_rows as Array<Record<string, unknown>>).map(row => {
            const st = String(row?.status ?? "").trim().toLowerCase();
            const exec = String(row?.execution_source ?? "").trim().toLowerCase();
            const trSrc = String(row?.tool_result_source ?? "").trim().toLowerCase();
            const provenance =
              exec === "recorded" || st === "recorded"
                ? "recorded"
                : exec === "missing" || st === "missing"
                  ? "missing"
                  : "simulated";
            return {
              round: Number(ev?.round ?? 0) || 0,
              mode: String(ev?.mode ?? "").trim(),
              name: String(row?.name ?? "").trim(),
              status: st,
              callId: String(row?.call_id ?? "").trim(),
              matchTier: String(row?.match_tier ?? "").trim().toLowerCase(),
              executionSource: exec || (st === "recorded" ? "recorded" : "simulated"),
              toolResultSource: trSrc || (st === "recorded" ? "baseline_snapshot" : "dry_run"),
              provenance,
              argumentsPreview: String(row?.arguments_preview ?? "").trim(),
              resultPreview: String(row?.result_preview ?? "").trim(),
            };
          })
        : []
    )
    .filter(row => row.name);
  const summaryToolResultCountRaw =
    attempt?.summary && typeof attempt.summary === "object" && !Array.isArray(attempt.summary)
      ? (attempt.summary as any).tool_result_count
      : undefined;
  const toolResultCount =
    summaryToolResultCountRaw != null
      ? Number(summaryToolResultCountRaw) || 0
      : toolResultCountFromSummary > 0
        ? toolResultCountFromSummary
        : flattenedToolLoopRows.length;
  const toolGroundingDetail =
    signalsDetailsRaw &&
    typeof signalsDetailsRaw.tool_grounding === "object" &&
    !Array.isArray(signalsDetailsRaw.tool_grounding)
      ? (signalsDetailsRaw.tool_grounding as Record<string, unknown>)
      : null;
  const toolGroundingStatus = String(toolGroundingDetail?.status ?? "").trim().toLowerCase();
  const toolGroundingReason = String(toolGroundingDetail?.reason ?? "").trim();
  const responseDiffLines = useMemo(() => {
    if (!baselineResponse || !candidateResponse) return [];
    return computeSimpleLineDiff(baselineResponse, candidateResponse, 200);
  }, [baselineResponse, candidateResponse]);

  const pass = Boolean(attempt?.pass);
  const decisionReasons: string[] = Array.isArray(attempt?.failure_reasons)
    ? (attempt.failure_reasons as string[])
    : [];
  const failedSignals = signalsRows.filter(r => r.status === "fail");
  const diffTabEnabled = Boolean(baselineResponse && candidateResponse);
  const replayLatencyLabel = formatDurationMs((attempt?.replay ?? {}).avg_latency_ms);
  const sequenceEdits = Number((attempt?.behavior_diff ?? {}).sequence_edit_distance ?? 0);
  const toolDivergencePct = Number((attempt?.behavior_diff ?? {}).tool_divergence_pct ?? 0);
  const toolDivergenceLabel = percentFromRate(toolDivergencePct / 100);
  const evalPassCount = signalsPassed.length;
  const evalTotalCount = signalsApplicable.length;
  const providerErrorPreview = String((attempt?.replay?.provider_error as any)?.response_preview ?? "").trim();
  const providerErrorMessage = String((attempt?.replay?.provider_error as any)?.message ?? "").trim();
  const responseDataKeys = Array.isArray((candidateSnapshot as any)?.response_data_keys)
    ? ((candidateSnapshot as any)?.response_data_keys as unknown[]).map(key => String(key))
    : [];
  const hasProviderError = Boolean(providerErrorPreview || providerErrorMessage);
  const baselineLineCount = baselineResponse ? baselineResponse.split("\n").length : 0;
  const candidateLineCount = candidateResponse ? candidateResponse.split("\n").length : 0;
  const diffAddedCount = responseDiffLines.filter(line => line.startsWith("+")).length;
  const diffRemovedCount = responseDiffLines.filter(line => line.startsWith("-")).length;
  const diffConfidenceLabel = (() => {
    if (baselineResponse && candidateResponse) return "High";
    if (baselineResponse || candidateResponse) return "Low";
    return "Unavailable";
  })();
  const diffConfidenceMessage = (() => {
    if (baselineResponse && candidateResponse) return "Both responses captured.";
    if (!baselineResponse && !candidateResponse) return "Both response previews are missing.";
    return "One side is missing; compare with caution.";
  })();
  const gateConfidence = (() => {
    if (toolGroundingStatus === "fail") {
      return {
        label: "Low",
        detail: toolGroundingReason || "Tool results were not grounded into a stable final response.",
        toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-200",
      };
    }
    if (
      toolTotalCalls > 0 &&
      toolExecutedCount === 0 &&
      toolRecordedCount === 0 &&
      toolSimulatedCount > 0
    ) {
      return {
        label: "Low",
        detail:
          "Tool calls were detected, but no recorded baseline tool results were injected — evidence is dry-run (Simulated) only.",
        toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-200",
      };
    }
    if (hasProviderError) {
      return {
        label: "Low",
        detail: "Provider warnings detected in this attempt.",
        toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-200",
      };
    }
    if (!baselineResponse && !candidateResponse) {
      return {
        label: "Low",
        detail: "Both response previews are missing.",
        toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-200",
      };
    }
    if (!baselineResponse || !candidateResponse || evalTotalCount === 0) {
      return {
        label: "Medium",
        detail: "Some evidence channels are missing or limited.",
        toneClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      };
    }
    return {
      label: "High",
      detail: "All core evidence channels are captured.",
      toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    };
  })();
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
      reason:
        formatSignalWhy("latency", (signalsDetailsRaw as any)?.latency) ||
        "Latency evidence missing; decision relied on other blocking checks.",
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
  const failedGates = gateRows.filter(g => g.status === "fail");
  const decisionSourceLabels = (() => {
    const failedOrdered = [
      policyRows.length > 0 ? "Policy" : null,
      failedGates.some(g => g.id === "tool_integrity") ? "Tool Integrity" : null,
      failedGates.some(g => g.id === "latency") ? "Latency" : null,
      failedGates.some(g => g.id === "regression_diff") ? "Regression Diff" : null,
    ].filter((v): v is string => Boolean(v));
    if (failedOrdered.length > 0) return failedOrdered;
    return [
      policyRows.length > 0 ? "Policy" : null,
      "Tool Integrity",
      gateRows.some(g => g.id === "latency" && g.status !== "not_applicable") ? "Latency" : null,
      "Regression Diff",
    ].filter((v): v is string => Boolean(v));
  })();
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

  const inputPreview = candidateInput || baselineInput;

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md sm:p-6">
      <div className="flex h-[90vh] w-full max-w-[1680px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0f14] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-6 py-4 sm:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-6 xl:gap-8">
            <div className="min-w-0 shrink">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                Unit diagnostics
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                <h2 className="text-base font-semibold text-white text-balance">
                  Input {inputIndex + 1}
                </h2>
                
                {attemptCount > 1 && (
                  <div className="relative ml-2">
                    <button
                      type="button"
                      onClick={() => setInputExpanded(!inputExpanded)}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/5 transition"
                    >
                      <span>Attempt {navIndex + 1}</span>
                      <span className="text-[10px] text-slate-500">/ {attemptCount}</span>
                      <ChevronDown className={clsx("h-4 w-4 text-slate-400 transition-transform", inputExpanded && "rotate-180")} />
                    </button>
                    
                    {inputExpanded && (
                      <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-[#1e2028] p-2 shadow-2xl z-[12000]">
                        <div className="mb-2 flex items-center justify-between px-2 pt-1">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                            Attempts
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFailedOnly(!failedOnly);
                            }}
                            className={clsx(
                              "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition",
                              failedOnly
                                ? "bg-rose-500/20 text-rose-300"
                                : "text-slate-400 hover:text-slate-200"
                            )}
                          >
                            Failed only
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-0.5">
                          {attempts.map((att, i) => {
                            const isPass = Boolean(att?.pass);
                            if (failedOnly && isPass) return null;
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setNavIndex(i);
                                  setInputExpanded(false);
                                }}
                                className={clsx(
                                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition",
                                  navIndex === i
                                    ? "bg-white/10 text-white"
                                    : "text-slate-300 hover:bg-white/5"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {isPass ? (
                                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                  ) : (
                                    <ShieldX className="h-4 w-4 text-rose-400" />
                                  )}
                                  <span>Attempt {i + 1}</span>
                                </div>
                                {navIndex === i && (
                                  <span className="text-[10px] text-slate-500">Current</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <span
                  className={clsx(
                    "ml-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tabular-nums",
                    pass
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  )}
                >
                  {pass ? "PASS" : "FAIL"}
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {replayLatencyLabel}
                </span>
                <span className="text-[11px] text-slate-500 truncate max-w-[min(360px,40vw)]">
                  {baselineModel} → {candidateModel}
                </span>
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Attempt detail tabs"
              className="hidden shrink-0 flex-wrap items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1 md:flex"
            >
              {(
                [
                  { id: "summary" as const, label: "Summary" },
                  { id: "comparison" as const, label: "Comparison" },
                  { id: "debug" as const, label: "Raw Trace" },
                ] as const
              ).map(tab => {
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={detailMainTab === tab.id}
                    onClick={() => setDetailMainTab(tab.id)}
                    className={clsx(
                      "rounded-lg px-4 py-1.5 text-[11px] font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70",
                      detailMainTab === tab.id
                        ? "bg-white/[0.12] text-white shadow-sm"
                        : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
          >
            Close
          </button>
        </div>

        {/* Mobile Tab Fallback */}
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/8 px-4 py-2.5 md:hidden">
          {(
            [
              { id: "summary" as const, label: "Summary" },
              { id: "comparison" as const, label: "Comparison" },
              { id: "debug" as const, label: "Raw Trace" },
            ] as const
          ).map(tab => {
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={detailMainTab === tab.id}
                onClick={() => setDetailMainTab(tab.id)}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70",
                  detailMainTab === tab.id
                    ? "bg-white/[0.12] text-white shadow-sm"
                    : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 md:p-7 xl:p-8">
              {detailMainTab === "summary" && (
                <div className="mx-auto max-w-[1200px] space-y-6">
                  {/* Global Status Banner + KPIs */}
                  <div
                    className={clsx(
                      "flex flex-col gap-5 rounded-3xl border px-6 py-5",
                      pass
                        ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                        : "border-rose-500/25 bg-rose-500/[0.04]"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 space-y-2">
                        <div
                          className={clsx(
                            "flex items-center gap-2 text-sm font-bold uppercase tracking-wider",
                            pass ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          <span>{pass ? "Release Ready" : "Release Blocked"}</span>
                          <span className="inline-block h-2 w-2 rounded-full bg-current" />
                        </div>
                        <p className="max-w-3xl text-base font-medium leading-7 text-slate-100 text-balance">
                          {decisionHeadline.replace(/^Reason:\s*/i, "")}
                        </p>
                      </div>
                      <div className="min-w-[220px] rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Decision Confidence
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={clsx(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                              gateConfidence.toneClass
                            )}
                          >
                            {gateConfidence.label}
                          </span>
                          <span className="text-xs text-slate-400">Trust calibration</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-300">{gateConfidence.detail}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Eval Checks
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white tabular-nums">
                          {evalTotalCount > 0 ? `${evalPassCount}/${evalTotalCount}` : "—"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {failedSignals.length > 0
                            ? `${failedSignals.length} failing signal${failedSignals.length === 1 ? "" : "s"}`
                            : "No failing eval signals"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Policy
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white tabular-nums">
                          {policyRows.length === 0 ? "Clean" : `${policyRows.length} found`}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {policyRows.length === 0 ? "No blocking issues" : "Review policy details"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Replay
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white tabular-nums">
                          {replayLatencyLabel}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {baselineModel} → {candidateModel}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Tool Divergence
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white tabular-nums">
                          {sequenceEdits} edit{sequenceEdits === 1 ? "" : "s"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{toolDivergenceLabel} divergence</div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Tool Evidence
                        </span>
                        <span
                          className={clsx(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            toolEvidenceStatus === "calls_detected_no_execution"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          )}
                        >
                          {toolTotalCalls > 0 ? "Detected" : "None"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                        <span>Calls {toolTotalCalls}</span>
                        <span>Executed {toolExecutedCount}</span>
                        <span>Recorded {toolRecordedCount}</span>
                        <span>Simulated {toolSimulatedCount}</span>
                        <span>Skipped {toolSkippedCount}</span>
                        <span>Failed {toolFailedCount}</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">{toolEvidenceDetail}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Loop {toolLoopStatus} {toolLoopRounds > 0 ? `(rounds ${toolLoopRounds})` : ""}
                      </p>
                      {gateToolTimelineRows.length > 0 ? (
                        <div className="mt-4 border-t border-white/5 pt-4">
                          <ToolTimelinePanel
                            rows={gateToolTimelineRows}
                            title="Tool timeline"
                            subtitle="Aligned with Live View snapshot detail (provenance badges)."
                            icon={Wrench}
                            variant="compact"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Main Content Grid */}
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="space-y-5">
                      <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            User Input
                          </div>
                          <button
                            type="button"
                            onClick={() => setInputExpanded(v => !v)}
                            className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/80 transition-colors hover:text-fuchsia-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                          >
                            {inputExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                        <p
                          className={clsx(
                            "mt-3 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap break-words",
                            !inputExpanded && "line-clamp-5"
                          )}
                        >
                          {inputPreview}
                        </p>
                      </div>

                      <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
                        <div className="mb-4 flex items-center justify-between gap-2">
                          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-400/80" />
                            Output Quality (Eval)
                          </h3>
                          <div className="text-[11px] text-slate-500">
                            User-facing checks with clear pass/fail evidence.
                          </div>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-2">
                          {!signalsChecksRaw ? (
                            <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-5 text-sm text-slate-500">
                              <p>No eval signals returned.</p>
                              <p className="mt-2 text-xs text-slate-400">Eval coverage: 0</p>
                              <p className="mt-1 text-xs text-slate-400">
                                Decision derived from {decisionSourceLabels.join(" / ")}.
                              </p>
                            </div>
                          ) : signalsRows.length === 0 ? (
                            <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-5 text-sm text-slate-500">
                              <p>No signal rows.</p>
                              <p className="mt-2 text-xs text-slate-400">Eval coverage: 0</p>
                              <p className="mt-1 text-xs text-slate-400">
                                Decision derived from {decisionSourceLabels.join(" / ")}.
                              </p>
                            </div>
                          ) : (
                            signalsRows.map(row => {
                              const barNode =
                                signalsDetailsRaw
                                  ? formatSignalValue(row.id, (signalsDetailsRaw as any)?.[row.id], row.pass)
                                  : null;
                              const evidenceText =
                                signalsDetailsRaw
                                  ? formatSignalWhy(row.id, (signalsDetailsRaw as any)?.[row.id])
                                  : "Evidence unavailable for this check.";
                              return (
                                <div
                                  key={row.id}
                                  className="flex flex-col justify-between rounded-2xl border border-white/5 bg-black/20 p-4"
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm font-medium text-slate-200">{row.label}</span>
                                    <span className="shrink-0 flex items-center gap-2">
                                      {row.status === "not_applicable" ? (
                                        <span className="text-[10px] font-bold uppercase text-slate-500">N/A</span>
                                      ) : row.pass ? (
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold uppercase text-emerald-400/80">Pass</span>
                                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/80" />
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold uppercase text-rose-400">Fail</span>
                                          <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="mt-3">{barNode}</div>
                                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                                    {evidenceText}
                                  </p>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Replay Context
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Models</div>
                            <div className="mt-1 text-sm font-medium text-slate-100 break-words">
                              {baselineModel} → {candidateModel}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">{candidateProvider}</div>
                          </div>
                          <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Trace</div>
                            <div className="mt-1 text-sm font-medium text-slate-100 break-all">
                              {attempt?.trace_id ? String(attempt.trace_id) : "Not captured"}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">{replayLatencyLabel}</div>
                          </div>
                        </div>
                        {providerErrorMessage ? (
                          <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                              Replay Warning
                            </div>
                            <p className="mt-1 leading-relaxed text-amber-100/85">{providerErrorMessage}</p>
                          </div>
                        ) : null}
                      </div>

                      <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
                        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
                          System & Policy
                        </h3>
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm font-medium text-slate-200">Tool Divergence</span>
                              <div className="flex flex-col items-end">
                                <span
                                  className={clsx(
                                    "text-sm font-medium tabular-nums",
                                    sequenceEdits === 0 ? "text-slate-400" : "text-rose-300"
                                  )}
                                >
                                  {sequenceEdits} sequence edits
                                </span>
                                <span className="text-[10px] uppercase text-slate-500">{toolDivergenceLabel} divergence</span>
                              </div>
                            </div>
                          </div>

                          {policyRows.length > 0 ? (
                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
                              <div className="mb-3 flex items-center justify-between gap-4">
                                <span className="text-sm font-medium text-rose-200">Policy Violations</span>
                                <span className="text-xs font-bold text-rose-400">{policyRows.length} found</span>
                              </div>
                              <div className="space-y-2">
                                {policyRows.map(row => (
                                  <div key={row.key} className="rounded-lg bg-black/40 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-rose-100">{row.label}</span>
                                      {row.severity && (
                                        <span className="text-[10px] font-bold uppercase text-rose-400/80">
                                          {row.severity}
                                        </span>
                                      )}
                                    </div>
                                    {row.message && (
                                      <p className="mt-1 text-[11px] leading-relaxed text-rose-200/70">
                                        {row.message}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-sm font-medium text-slate-200">Policy Violations</span>
                                <span className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase text-emerald-400/80">Clean</span>
                                  <div className="h-2 w-2 rounded-full bg-emerald-400/80" />
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              )}

              {detailMainTab === "comparison" && (
                <div className="mx-auto flex w-full max-w-[1200px] min-h-[calc(90vh-220px)] flex-col gap-4">
                  <div className="grid gap-3 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Baseline</div>
                      <div className="mt-1.5 text-sm font-medium text-slate-100 break-words">{baselineModel}</div>
                      <div className="mt-1 text-xs text-slate-400 tabular-nums">{baselineLineCount} lines</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Candidate</div>
                      <div className="mt-1.5 text-sm font-medium text-slate-100 break-words">{candidateModel}</div>
                      <div className="mt-1 text-xs text-slate-400 tabular-nums">{candidateLineCount} lines</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Added / Changed</div>
                      <div className="mt-1.5 text-sm font-medium text-emerald-300 tabular-nums">+{diffAddedCount}</div>
                      <div className="mt-1 text-xs text-slate-400">Highlighted on the candidate side.</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Removed</div>
                      <div className="mt-1.5 text-sm font-medium text-rose-300 tabular-nums">-{diffRemovedCount}</div>
                      <div className="mt-1 text-xs text-slate-400">Track lines missing from the candidate output.</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                      Response Comparison
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>Green indicates added or modified candidate output.</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                        Diff confidence {diffConfidenceLabel}
                      </span>
                      {diffRemovedCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowRemovedDiffLines(v => !v)}
                          className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                        >
                          {showRemovedDiffLines ? "Hide removed lines" : `Show removed lines (${diffRemovedCount})`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="px-1 text-[11px] text-slate-500">{diffConfidenceMessage}</div>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                    <div className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-white/8 bg-[#0e0f11]">
                      <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Baseline
                        </span>
                        <span className="text-[10px] text-slate-400">{baselineModel}</span>
                      </div>
                      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 font-mono text-[13px] leading-[1.75] text-slate-300 whitespace-pre-wrap break-words">
                        {baselineResponse
                          ? baselineResponse
                          : baselineResponseStatus === "not_captured"
                            ? `Baseline response not captured (${baselineCaptureReason || "no reason"}).`
                            : baselineResponseStatus === "empty"
                              ? "Baseline response is empty."
                              : "Baseline response preview unavailable."}
                      </div>
                    </div>
                    <div className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-white/8 bg-[#0e0f11]">
                      <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Candidate
                        </span>
                        <span className="text-[10px] text-slate-400">{candidateModel}</span>
                      </div>
                      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-0 font-mono text-[13px] leading-[1.75] whitespace-pre-wrap break-words">
                        {!candidateResponse ? (
                          <div className="p-5 text-slate-500">
                            {candidateResponseStatus === "tool_calls_only"
                              ? "Candidate returned tool calls only (no assistant text)."
                              : candidateResponseStatus === "empty"
                                ? "Candidate response text is empty."
                                : "—"}
                          </div>
                        ) : responseDiffLines.length === 0 ? (
                          <div className="p-5 text-slate-300">{candidateResponse}</div>
                        ) : (
                          <div className="flex flex-col py-3 text-slate-300">
                            {responseDiffLines.map((line, idx) => {
                              const isAdded = line.startsWith("+");
                              const isRemoved = line.startsWith("-");
                              if (isRemoved && !showRemovedDiffLines) return null;
                              const content = isAdded ? line.substring(2) : line.substring(2);
                              return (
                                <div
                                  key={idx}
                                  className={clsx(
                                    "block w-full px-5 py-0.5",
                                    isAdded && "bg-emerald-500/20 font-medium text-emerald-200",
                                    isRemoved && "bg-rose-500/20 text-rose-200 line-through decoration-rose-300/70"
                                  )}
                                >
                                  {content || "\n"}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {detailMainTab === "debug" && (
                <div className="mx-auto flex w-full max-w-[1200px] min-h-[calc(90vh-220px)] flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-200">Raw Trace Payload</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Internal trace data for support and debugging. Inspect the untouched replay payload and provider metadata.
                      </p>
                    </div>
                  </div>

                  <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-10">
                    <div className="flex min-h-[400px] flex-col overflow-hidden rounded-3xl border border-white/8 bg-[#0a0a0c] xl:col-span-7">
                      <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-5 py-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          JSON Payload
                        </span>
                      </div>
                      <pre className="custom-scrollbar min-h-0 flex-1 overflow-auto p-6 font-mono text-[12px] leading-[1.7] text-slate-300 whitespace-pre-wrap break-words">
                        {candidatePayloadPreview}
                      </pre>
                    </div>

                    <div className="space-y-3 xl:col-span-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Provider</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">{candidateProvider}</div>
                        <div className="mt-1 text-xs text-slate-400">{candidateModel}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Payload Health</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">
                          {hasProviderError ? "Provider warning attached" : "Structured payload captured"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {responseDataKeys.length > 0 ? `${responseDataKeys.length} keys captured` : "No payload keys"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Tool Evidence</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">
                          {toolTotalCalls > 0
                            ? `${toolTotalCalls} call${toolTotalCalls === 1 ? "" : "s"} detected`
                            : "No tool calls detected"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Executed {toolExecutedCount} / Recorded {toolRecordedCount} / Simulated{" "}
                          {toolSimulatedCount} / Skipped {toolSkippedCount}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Loop {toolLoopStatus}
                          {toolLoopRounds > 0 ? ` (${toolLoopRounds} rounds)` : ""}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Tool results captured {toolResultCount}
                        </div>
                        {flattenedToolLoopRows.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {flattenedToolLoopRows.slice(0, 3).map((row, idx) => (
                              <div key={`${row.round}-${row.name}-${idx}`} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-medium text-slate-200">
                                    Round {row.round || 1} · {row.name}
                                    {row.callId ? (
                                      <span className="ml-1 font-mono text-[10px] font-normal text-slate-500">
                                        · id {row.callId}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span
                                    className={clsx(
                                      "text-[10px] uppercase tracking-wider",
                                      row.provenance === "recorded"
                                        ? "text-violet-300"
                                        : row.provenance === "missing"
                                          ? "text-amber-300"
                                          : "text-slate-400"
                                    )}
                                  >
                                    {row.provenance === "recorded"
                                      ? "Recorded"
                                      : row.provenance === "missing"
                                        ? "Missing"
                                        : row.status || "Simulated"}
                                  </span>
                                </div>
                                {row.matchTier === "name_order" ? (
                                  <p className="mt-1 text-[10px] text-amber-200/90" title="call_id mismatch">
                                    Weak match: baseline result matched by tool name order (cross-provider or missing
                                    id).
                                  </p>
                                ) : null}
                                {row.mode ? (
                                  <p className="mt-1 text-[10px] text-slate-500">Mode: {row.mode}</p>
                                ) : null}
                                {row.argumentsPreview ? (
                                  <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{row.argumentsPreview}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Extract Path</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">
                          {String((candidateSnapshot as any)?.response_extract_path ?? "Not captured")}
                        </div>
                        <div className="mt-1 text-xs text-slate-400 break-words">
                          {String((candidateSnapshot as any)?.response_extract_reason ?? "No extraction warning")}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Payload Keys</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">
                          {responseDataKeys.length > 0 ? responseDataKeys.slice(0, 10).join(", ") : "None captured"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {providerErrorPreview ? "Provider preview included" : "Structured response payload"}
                        </div>
                      </div>
                    </div>
                  </div>
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
  baselineSnapshotsById,
  recentSnapshots,
  onSelectCase,
}: {
  item: any;
  report: any;
  onClose?: () => void;
  baselineSnapshotsById?: Map<string, Record<string, unknown>>;
  recentSnapshots?: any[];
  onSelectCase?: (idx: number, attempts: any[], baselineSnapshot: Record<string, unknown> | null) => void;
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

  const reportCases = Array.isArray(report?.run_results)
    ? report.run_results
    : Array.isArray(report?.case_results)
      ? report.case_results
      : [];
  const historyToolGrounding = summarizeRunToolGroundingFromCases(reportCases);

  return (
    <div className="space-y-5">
      <div
        className={clsx(
          "flex flex-col gap-5 rounded-[24px] border px-6 py-5",
          item?.status === "pass"
            ? "border-emerald-500/25 bg-emerald-500/[0.04]"
            : "border-rose-500/25 bg-rose-500/[0.04]"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div
              className={clsx(
                "flex items-center gap-2 text-sm font-bold uppercase tracking-wider",
                item?.status === "pass" ? "text-emerald-400" : "text-rose-400"
              )}
            >
              <span>{item?.status === "pass" ? "GATE PASSED" : "GATE FAILED"}</span>
              <span className="inline-block h-2 w-2 rounded-full bg-current" />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <span>Inputs: {totalInputs}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>Repeats: {repeatRuns}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{formatDateTime(item?.created_at)}</span>
            </div>
          </div>
          {gateSummary && (
            <div className="text-right">
              <div className="text-[13px] font-semibold text-slate-100">
                Fail rate {percentFromRate(gateSummary.fail_rate)}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Flaky rate {percentFromRate(gateSummary.flaky_rate)}
              </div>
            </div>
          )}
        </div>

        {thresholdsRaw && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {typeof thresholdsRaw.fail_rate_max !== "undefined" && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-slate-300">
                Fail max {percentFromRate(thresholdsRaw.fail_rate_max)}
              </span>
            )}
            {typeof thresholdsRaw.flaky_rate_max !== "undefined" && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-slate-300">
                Flaky max {percentFromRate(thresholdsRaw.flaky_rate_max)}
              </span>
            )}
            {typeof gateSummary?.ratio_band === "string" && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-slate-300">
                Band {gateSummary.ratio_band}
              </span>
            )}
          </div>
        )}

        <div className="text-xs text-slate-500">
          Trace: <span className="font-mono text-[10px] text-slate-400">{item?.trace_id || report?.trace_id || "—"}</span>
        </div>
      </div>

      {historyToolGrounding ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-500">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            Tool grounding
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
            <span>
              With tools:{" "}
              <span className="font-semibold text-white/90">{historyToolGrounding.withTools}</span>
            </span>
            <span className="text-emerald-400/90">Pass {historyToolGrounding.pass}</span>
            <span className="text-rose-400/90">Fail {historyToolGrounding.fail}</span>
            {historyToolGrounding.semanticOk > 0 ? (
              <span className="text-violet-300/90">
                Semantic OK {historyToolGrounding.semanticOk}
              </span>
            ) : null}
            {historyToolGrounding.semanticOff > 0 ? (
              <span
                className="text-slate-500"
                title="Semantic judge did not run (e.g. no OpenAI key)."
              >
                Semantic judge off {historyToolGrounding.semanticOff}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

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

      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          Per-input breakdown
        </div>
        {reportCases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-500">
            No per-input result rows returned for this run.
          </div>
        ) : (
          <div className="space-y-2">
            {reportCases.map((run: any, idx: number) => {
              const attempts = Array.isArray(run?.attempts) ? run.attempts : [];
              const baselineSnapshotForRun =
                (baselineSnapshotsById?.get(String(run?.snapshot_id ?? "")) as
                  | Record<string, unknown>
                  | undefined) ??
                (recentSnapshots?.find(
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
                attempts.length || Number(item?.repeat_runs ?? gateSummary?.repeat_runs) || 1;
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
              
              const baselineInputPreview = String(
                baselineSnapshotForRun?.user_message ?? 
                baselineSnapshotForRun?.request_prompt ?? 
                ""
              ).trim();
              const caseGrounding = summarizeGroundingForCase(run);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (attempts.length > 0 && onSelectCase) {
                      onSelectCase(idx, attempts, baselineSnapshotForRun);
                    }
                  }}
                  data-testid={`rg-history-case-${idx}`}
                  className={clsx(
                    "group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                    caseIsPass
                      ? "border-emerald-500/10 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.06]"
                      : caseIsFlaky
                        ? "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
                        : "border-rose-500/15 bg-rose-500/[0.03] hover:bg-rose-500/10"
                  )}
                >
                  <span
                    className={clsx(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
                      caseIsPass
                        ? "bg-emerald-500/10 text-emerald-400"
                        : caseIsFlaky
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-rose-500/10 text-rose-400"
                    )}
                  >
                    {caseStatus}
                  </span>
                  <div className="min-w-0 flex-1 py-1">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-xs font-semibold text-slate-200">
                        Input {idx + 1}
                      </span>
                      {baselineInputPreview && (
                        <span className="truncate text-[11px] text-slate-400">
                          {baselineInputPreview}
                        </span>
                      )}
                    </div>
                    {caseGrounding.rollup && caseGrounding.rollup !== "na" ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span
                          className={clsx(
                            "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]",
                            caseGrounding.rollup === "pass"
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                              : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                          )}
                        >
                          Grounding {caseGrounding.rollup === "pass" ? "OK" : "fail"}
                        </span>
                        {caseGrounding.semantic === "pass" ? (
                          <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200">
                            Semantic OK
                          </span>
                        ) : null}
                        {caseGrounding.semantic === "unavailable" ? (
                          <span
                            className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500"
                            title="Semantic judge did not run (e.g. no OpenAI key configured)."
                          >
                            Semantic off
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={clsx(
                      "text-[10px] font-medium",
                      passedAttempts === totalAttempts ? "text-emerald-400/80" : "text-rose-400/80"
                    )}>
                      {passedAttempts}/{totalAttempts}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                      &rarr;
                    </span>
                  </div>
                </button>
              );
            })}
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
  const openBaselineDetailSnapshot = ctx.openBaselineDetailSnapshot as (
    s: Record<string, unknown>
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
  const runEvalElements = useMemo(
    () =>
      Array.isArray(ctx.runEvalElements)
        ? (ctx.runEvalElements as Array<{ name: string }>)
        : [],
    [ctx.runEvalElements]
  );
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
    attempts: any[];
    caseIndex: number;
    initialAttemptIndex: number;
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
  const toolGroundingRunSummary = useMemo(
    () => summarizeRunToolGroundingFromCases(resultCases),
    [resultCases]
  );
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
                                    onClick={() => openBaselineDetailSnapshot(snap)}
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
                                              openBaselineDetailSnapshot(
                                                snapshot as Record<string, unknown>
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
                        {/* Compact Global Status Banner */}
                        <div
                          className={clsx(
                            "flex flex-col gap-2 rounded-2xl border px-4 py-3",
                            result.pass
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                              : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider">
                              {result.pass ? "Gate Passed" : "Gate Failed"}
                            </span>
                            <span className="text-[10px] font-bold text-white/70">
                              Fail rate {percentFromRate(result.fail_rate)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                            <span>Inputs: {Number(result.total_inputs ?? 0)}</span>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span>Repeats: {Number(result.repeat_runs ?? repeatRuns)}</span>
                            {result?.perf && typeof result.perf === "object" && (
                              <>
                                <span className="h-1 w-1 rounded-full bg-white/20" />
                                <span>Avg: {formatDurationMs((result.perf as any).avg_attempt_wall_ms)}</span>
                              </>
                            )}
                          </div>
                          {toolGroundingRunSummary ? (
                            <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2">
                              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                                Tool grounding
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
                                <span>
                                  With tools:{" "}
                                  <span className="font-semibold text-white/90">
                                    {toolGroundingRunSummary.withTools}
                                  </span>
                                </span>
                                <span className="text-emerald-400/90">
                                  Pass {toolGroundingRunSummary.pass}
                                </span>
                                <span className="text-rose-400/90">
                                  Fail {toolGroundingRunSummary.fail}
                                </span>
                                {toolGroundingRunSummary.semanticOk > 0 ? (
                                  <span className="text-violet-300/90">
                                    Semantic OK {toolGroundingRunSummary.semanticOk}
                                  </span>
                                ) : null}
                                {toolGroundingRunSummary.semanticOff > 0 ? (
                                  <span
                                    className="text-slate-500"
                                    title="Semantic judge did not run (e.g. no OpenAI key)."
                                  >
                                    Semantic judge off {toolGroundingRunSummary.semanticOff}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {!result.pass && whatToFixHints.length > 0 && (
                          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                              What to fix first
                            </div>
                            <div className="mt-3 flex flex-col gap-2">
                              {whatToFixHints.map((hint, idx) => (
                                <div
                                  key={hint.key}
                                  className="flex items-start justify-between gap-3 text-sm text-amber-100/90"
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {idx + 1}. {hint.label}
                                  </span>
                                  <span className="shrink-0 text-xs font-semibold text-amber-400">
                                    {hint.count}x
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                              Per-input breakdown
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
                            
                            const baselineInputPreview = String(
                              baselineSnapshotForRun?.user_message ?? 
                              baselineSnapshotForRun?.request_prompt ?? 
                              ""
                            ).trim();
                            const caseGrounding = summarizeGroundingForCase(run);

                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (attempts.length > 0) {
                                    setDetailAttemptView({
                                      attempts,
                                      caseIndex: idx,
                                      initialAttemptIndex: 0,
                                      baselineSnapshot: baselineSnapshotForRun,
                                    });
                                  }
                                }}
                                data-testid={`rg-result-case-${idx}`}
                                className={clsx(
                                  "group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                                  caseIsPass
                                    ? "border-emerald-500/10 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.06]"
                                    : caseIsFlaky
                                      ? "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
                                      : "border-rose-500/15 bg-rose-500/[0.03] hover:bg-rose-500/10"
                                )}
                              >
                                <span
                                  className={clsx(
                                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
                                    caseIsPass
                                      ? "bg-emerald-500/10 text-emerald-400"
                                      : caseIsFlaky
                                        ? "bg-amber-500/15 text-amber-300"
                                        : "bg-rose-500/10 text-rose-400"
                                  )}
                                >
                                  {caseStatus}
                                </span>
                                <div className="min-w-0 flex-1 py-1">
                                  <div className="flex items-baseline gap-2">
                                    <span className="shrink-0 text-xs font-semibold text-slate-200">
                                      Input {idx + 1}
                                    </span>
                                    {baselineInputPreview && (
                                      <span className="truncate text-[11px] text-slate-400">
                                        {baselineInputPreview}
                                      </span>
                                    )}
                                  </div>
                                  {caseGrounding.rollup && caseGrounding.rollup !== "na" ? (
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                      <span
                                        className={clsx(
                                          "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]",
                                          caseGrounding.rollup === "pass"
                                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                            : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                                        )}
                                      >
                                        Grounding {caseGrounding.rollup === "pass" ? "OK" : "fail"}
                                      </span>
                                      {caseGrounding.semantic === "pass" ? (
                                        <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200">
                                          Semantic OK
                                        </span>
                                      ) : null}
                                      {caseGrounding.semantic === "unavailable" ? (
                                        <span
                                          className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500"
                                          title="Semantic judge did not run (e.g. no OpenAI key configured)."
                                        >
                                          Semantic off
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className={clsx(
                                    "text-[10px] font-medium",
                                    passedAttempts === totalAttempts ? "text-emerald-400/80" : "text-rose-400/80"
                                  )}>
                                    {passedAttempts}/{totalAttempts}
                                  </span>
                                  <span className="text-[10px] font-medium text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                                    &rarr;
                                  </span>
                                </div>
                              </button>
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
                        baselineSnapshotsById={baselineSnapshotsById}
                        recentSnapshots={recentSnapshots}
                        onSelectCase={(caseIndex, attempts, baselineSnapshot) => {
                          setDetailAttemptView({
                            attempts,
                            caseIndex,
                            initialAttemptIndex: 0,
                            baselineSnapshot,
                          });
                        }}
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
              attempts={detailAttemptView.attempts}
              initialAttemptIndex={detailAttemptView.initialAttemptIndex}
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
                      baselineSnapshotsById={baselineSnapshotsById}
                      recentSnapshots={recentSnapshots}
                      onSelectCase={(caseIndex, attempts, baselineSnapshot) => {
                        setDetailAttemptView({
                          attempts,
                          caseIndex,
                          initialAttemptIndex: 0,
                          baselineSnapshot,
                        });
                      }}
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
