"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronLeft, ChevronRight, ShieldCheck, ShieldX, Wrench } from "lucide-react";
import { sanitizePayloadForPreview } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGatePageContent";
import {
  computeSimpleLineDiff,
  normalizeViolationRuleId,
  toHumanRuleLabel,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";
import { percentFromRate } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateViewUtils";
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import type { LiveViewToolTimelineRow } from "@/lib/api/live-view";
import {
  getConfiguredEvalCheckIds,
  getConfiguredPolicyCheckIds,
  isCanonicalEvalCheckId,
  isRuntimeOnlyEvalCheckId,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateEvalChecks";
import { ReleaseGateReplayRequestMetaPanel } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateReplayRequestMetaPanel";

export type AttemptDetailMainTab = "review" | "debug";

const RESPONSE_PREVIEW_LINE_LIMIT = 36;
const RESPONSE_PREVIEW_CHAR_LIMIT = 3200;
const RESPONSE_DIFF_LINE_LIMIT = 80;

function truncateResponsePreview(
  text: string,
  lineLimit = RESPONSE_PREVIEW_LINE_LIMIT,
  charLimit = RESPONSE_PREVIEW_CHAR_LIMIT
): string {
  if (!text) return text;

  const lines = text.split("\n");
  const lineTrimmed = lines.slice(0, lineLimit).join("\n");
  const charTrimmed =
    lineTrimmed.length > charLimit ? lineTrimmed.slice(0, charLimit) : lineTrimmed;
  const wasTrimmed = lines.length > lineLimit || text.length > charTrimmed.length;

  return wasTrimmed ? charTrimmed.trimEnd() + "\n..." : charTrimmed;
}

function summarizeCompactPreview(text: string, maxChars = 220): string {
  if (!text) return "";
  return truncateResponsePreview(text, 6, maxChars).replace(/\n{3,}/g, "\n\n");
}

export function AttemptDetailOverlay({
  open,
  onClose,
  inputIndex,
  attempts,
  initialAttemptIndex = 0,
  baselineSnapshot,
  replayRequestMeta = null,
  toolContext = null,
}: {
  open: boolean;
  onClose: () => void;
  inputIndex: number;
  attempts: any[];
  initialAttemptIndex?: number;
  baselineSnapshot: Record<string, unknown> | null;
  replayRequestMeta?: Record<string, unknown> | null;
  toolContext?: Record<string, unknown> | null;
}) {
  const [detailMainTab, setDetailMainTab] = useState<AttemptDetailMainTab>("review");
  const [attemptMenuOpen, setAttemptMenuOpen] = useState(false);
  const [userInputExpanded, setUserInputExpanded] = useState(false);
  const [showRemovedDiffLines, setShowRemovedDiffLines] = useState(false);
  const [navIndex, setNavIndex] = useState(0);
  const diffSectionRef = useRef<HTMLDivElement | null>(null);
  const detailsSectionRef = useRef<HTMLDivElement | null>(null);
  const toolBehaviorSectionRef = useRef<HTMLDivElement | null>(null);

  const attemptCount = Array.isArray(attempts) ? attempts.length : 0;
  const maxNav = Math.max(0, attemptCount - 1);
  const safeInitial = Math.min(Math.max(0, initialAttemptIndex), maxNav);

  const [failedOnly, setFailedOnly] = useState(false);
  const [showToolBehaviorDetails, setShowToolBehaviorDetails] = useState(false);
  const [showFullResponseDiff, setShowFullResponseDiff] = useState(false);

  useEffect(() => {
    if (open) {
      setDetailMainTab("review");
      setAttemptMenuOpen(false);
      setUserInputExpanded(false);
      setShowRemovedDiffLines(false);
      setNavIndex(safeInitial);
      setFailedOnly(false);
      setShowToolBehaviorDetails(false);
      setShowFullResponseDiff(false);
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
      const severity = String(v?.severity ?? "")
        .trim()
        .toLowerCase();
      return {
        key: `${ruleId || "violation"}-${idx}`,
        label: ruleName || ruleId || `Violation ${idx + 1}`,
        message,
        severity,
      };
    })
    .filter((r: PolicyRow) => Boolean(r.label));

  const signalsChecksRaw = (
    attempt?.signals && typeof attempt.signals === "object"
      ? (attempt.signals as Record<string, unknown>).checks
      : undefined
  ) as Record<string, unknown> | undefined;
  const configuredEvalCheckIds = getConfiguredEvalCheckIds(
    attempt?.signals && typeof attempt.signals === "object"
      ? (attempt.signals as Record<string, unknown>).config_check_ids
      : undefined
  );
  const configuredPolicyCheckIds = getConfiguredPolicyCheckIds(
    attempt?.signals && typeof attempt.signals === "object"
      ? (attempt.signals as Record<string, unknown>).config_check_ids
      : undefined
  );
  const configuredEvalCheckIdSet =
    configuredEvalCheckIds.length > 0 ? new Set(configuredEvalCheckIds) : null;
  const toolPolicyEnabled = configuredPolicyCheckIds.includes("tool");
  const signalsRows = signalsChecksRaw
    ? Object.entries(signalsChecksRaw).map(([id, status]) => {
        const normalizedId = normalizeViolationRuleId(id);
        const label = toHumanRuleLabel(normalizedId, id);
        const s = String(status ?? "")
          .trim()
          .toLowerCase();
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
  const runtimeChecksRaw =
    attempt?.signals && typeof attempt.signals === "object"
      ? ((attempt.signals as any).runtime_checks as Record<string, unknown> | undefined)
      : undefined;
  const runtimeDetailsRaw =
    attempt?.signals && typeof attempt.signals === "object"
      ? ((attempt.signals as any).runtime_details as Record<string, unknown> | undefined)
      : undefined;
  const canonicalSignalRows = signalsRows.filter(row =>
    configuredEvalCheckIdSet ? configuredEvalCheckIdSet.has(row.id) : isCanonicalEvalCheckId(row.id)
  );
  const runtimeSignalRows = runtimeChecksRaw
    ? Object.entries(runtimeChecksRaw).map(([id, status]) => {
        const normalizedId = normalizeViolationRuleId(id);
        const label = toHumanRuleLabel(normalizedId, id);
        const s = String(status ?? "")
          .trim()
          .toLowerCase();
        return {
          id: normalizedId || id,
          label,
          status: s,
          pass: s === "pass",
          applicable: s === "pass" || s === "fail",
        };
      })
    : signalsRows.filter(
        row => isRuntimeOnlyEvalCheckId(row.id) || !isCanonicalEvalCheckId(row.id)
      );
  const signalsPassed = canonicalSignalRows.filter(r => r.pass);

  const formatSignalValue = (id: string, raw: unknown, pass: boolean): React.ReactNode => {
    const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const status = String(d.status ?? "")
      .trim()
      .toLowerCase();
    if (!status) return null;

    if (id === "length") {
      const failRatio = Number(d.fail_ratio);
      const actualChars = Number(d.actual_chars);
      const baselineLen = Number(d.baseline_len);
      if (!Number.isFinite(baselineLen) || !Number.isFinite(actualChars)) return null;

      const maxAllowed = Math.round(
        baselineLen * (1 + (Number.isFinite(failRatio) ? failRatio : 0.5))
      );
      const pct = Math.min(100, Math.max(0, (actualChars / maxAllowed) * 100));

      return (
        <div className="mt-2 space-y-1.5 w-full max-w-md">
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-white/40">
            <span>Base {baselineLen} chars</span>
            <span className={pass ? "text-emerald-400" : "text-rose-400"}>
              Actual {actualChars} chars
            </span>
            <span>Max {maxAllowed}</span>
          </div>
          <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden flex">
            <div
              className={clsx("h-full transition-all", pass ? "bg-emerald-500" : "bg-rose-500")}
              style={{ width: `${pct}%` }}
            />
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
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-white/40">
            <span>Actual {actualMs}ms</span>
            <span className={pass ? "text-white/40" : "text-rose-400"}>Limit {failMs}ms</span>
          </div>
          <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden flex">
            <div
              className={clsx("h-full transition-all", pass ? "bg-emerald-500" : "bg-rose-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  const formatSignalWhy = (id: string, raw: unknown): string => {
    const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!d) return "Evidence unavailable for this check.";
    const status = String(d.status ?? "")
      .trim()
      .toLowerCase();
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
      const parsed = typeof d.parsed_ok === "boolean" ? (d.parsed_ok ? "ok" : "failed") : "unknown";
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
        typeof d.response_present === "boolean" ? (d.response_present ? "yes" : "no") : "unknown";
      const matchedTokens = Array.isArray(d.matched_tokens)
        ? (d.matched_tokens as unknown[]).map(v => String(v ?? "").trim()).filter(Boolean)
        : [];
      const matchedFacts = Array.isArray(d.matched_facts)
        ? (d.matched_facts as unknown[]).map(v => String(v ?? "").trim()).filter(Boolean)
        : [];
      const semanticStatus = String(d.semantic_status ?? "")
        .trim()
        .toLowerCase();
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

  const formatSignalMetric = (id: string, raw: unknown): string | null => {
    const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!d) return null;
    const toNum = (value: unknown): number | null => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    if (id === "empty") {
      const actualChars = toNum(d.actual_chars);
      const minChars = toNum(d.min_chars);
      if (actualChars !== null && minChars !== null) {
        return `${Math.round(actualChars)} chars / min ${Math.round(minChars)}`;
      }
      return null;
    }

    if (id === "latency") {
      const actualMs = toNum(d.actual_ms);
      const failMs = toNum(d.fail_ms);
      if (actualMs !== null && failMs !== null) {
        const margin = failMs - actualMs;
        return `${Math.round(actualMs)}ms / ${Math.round(failMs)}ms${margin >= 0 ? ` (${Math.round(margin)}ms headroom)` : ""}`;
      }
      return null;
    }

    if (id === "status_code") {
      const actualStatus = toNum(d.actual_status);
      const failFrom = toNum(d.fail_from);
      if (actualStatus !== null && failFrom !== null) {
        return `${Math.round(actualStatus)} / fails from ${Math.round(failFrom)}`;
      }
      return null;
    }

    if (id === "refusal") {
      if (typeof d.matched === "boolean") {
        return d.matched ? "Matched refusal pattern" : "No refusal pattern";
      }
      return null;
    }

    if (id === "json") {
      const mode = String(d.mode ?? "default").trim() || "default";
      const parsed =
        typeof d.parsed_ok === "boolean"
          ? d.parsed_ok
            ? "parsed"
            : "parse failed"
          : "parse unknown";
      return `${mode} mode · ${parsed}`;
    }

    if (id === "length") {
      const baselineLen = toNum(d.baseline_len);
      const actualChars = toNum(d.actual_chars);
      const failRatio = toNum(d.fail_ratio);
      if (baselineLen !== null && actualChars !== null) {
        const maxAllowed = Math.round(baselineLen * (1 + (failRatio !== null ? failRatio : 0.5)));
        const deltaPct =
          baselineLen > 0 ? (((actualChars - baselineLen) / baselineLen) * 100).toFixed(1) : null;
        return `${Math.round(actualChars)} / max ${maxAllowed}${deltaPct ? ` (${Number(deltaPct) >= 0 ? "+" : ""}${deltaPct}%)` : ""}`;
      }
      return null;
    }

    if (id === "repetition") {
      const maxRepeats = toNum(d.max_line_repeats);
      const failRepeats = toNum(d.fail_line_repeats);
      if (maxRepeats !== null && failRepeats !== null) {
        return `${Math.round(maxRepeats)} repeats / fail ${Math.round(failRepeats)}`;
      }
      return null;
    }

    if (id === "tool_grounding") {
      const groundedRows = toNum(d.grounded_rows);
      const evaluatedRows = toNum(d.evaluated_rows);
      if (groundedRows !== null && evaluatedRows !== null) {
        return `${Math.round(groundedRows)} / ${Math.round(evaluatedRows)} grounded`;
      }
      return null;
    }

    return null;
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
  const candidateModel =
    String(
      candidateSnapshot?.model ??
        (attempt?.summary?.target && typeof attempt.summary.target === "object"
          ? (attempt.summary.target as Record<string, unknown>).model
          : undefined) ??
        "—"
    ).trim() || "—";
  const candidateProvider = String(candidateSnapshot?.provider ?? "—").trim() || "—";
  const candidateInput =
    String(candidateSnapshot?.input_text ?? baselineInput ?? "—").trim() || "—";
  const candidateResponse = String(
    candidateSnapshot?.response_preview ?? attempt?.replay?.provider_error?.response_preview ?? ""
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
  const baselineCaptureReason = String(
    (attempt as any)?.baseline_snapshot?.capture_reason ?? ""
  ).trim();
  const candidateResponseStatus = String((candidateSnapshot as any)?.response_preview_status ?? "")
    .trim()
    .toLowerCase();
  const toolExecutionSummary =
    attempt?.tool_execution_summary &&
    typeof attempt.tool_execution_summary === "object" &&
    !Array.isArray(attempt.tool_execution_summary)
      ? (attempt.tool_execution_summary as Record<string, unknown>)
      : null;
  const toolEvidenceRows = useMemo(
    () =>
      Array.isArray(attempt?.tool_evidence)
        ? (attempt.tool_evidence as Array<Record<string, unknown>>)
        : [],
    [attempt?.tool_evidence]
  );
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
  const toolEvidenceStatus = String(toolExecutionSummary?.status ?? "")
    .trim()
    .toLowerCase();
  const replayObj =
    attempt?.replay && typeof attempt.replay === "object" && !Array.isArray(attempt.replay)
      ? (attempt.replay as Record<string, unknown>)
      : {};
  const toolLoopStatus =
    String(
      replayObj.tool_loop_status ?? (candidateSnapshot as any)?.tool_loop_status ?? "not_needed"
    ).trim() || "not_needed";
  const toolLoopRounds =
    Number(replayObj.tool_loop_rounds ?? (candidateSnapshot as any)?.tool_loop_rounds ?? 0) || 0;
  const toolLoopEvents = Array.isArray(
    replayObj.tool_loop_events ?? (candidateSnapshot as any)?.tool_loop_events
  )
    ? ((replayObj.tool_loop_events ?? (candidateSnapshot as any)?.tool_loop_events) as Array<
        Record<string, unknown>
      >)
    : [];
  const flattenedToolLoopRows = toolLoopEvents
    .flatMap(ev =>
      Array.isArray(ev?.tool_rows)
        ? (ev.tool_rows as Array<Record<string, unknown>>).map(row => {
            const st = String(row?.status ?? "")
              .trim()
              .toLowerCase();
            const exec = String(row?.execution_source ?? "")
              .trim()
              .toLowerCase();
            const trSrc = String(row?.tool_result_source ?? "")
              .trim()
              .toLowerCase();
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
              matchTier: String(row?.match_tier ?? "")
                .trim()
                .toLowerCase(),
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
    runtimeDetailsRaw &&
    typeof runtimeDetailsRaw.tool_grounding === "object" &&
    !Array.isArray(runtimeDetailsRaw.tool_grounding)
      ? (runtimeDetailsRaw.tool_grounding as Record<string, unknown>)
      : signalsDetailsRaw &&
          typeof signalsDetailsRaw.tool_grounding === "object" &&
          !Array.isArray(signalsDetailsRaw.tool_grounding)
        ? (signalsDetailsRaw.tool_grounding as Record<string, unknown>)
        : null;
  const toolGroundingStatus = String(toolGroundingDetail?.status ?? "")
    .trim()
    .toLowerCase();
  const toolGroundingReason = String(toolGroundingDetail?.reason ?? "").trim();
  const toolExpectationDetail =
    runtimeDetailsRaw &&
    typeof runtimeDetailsRaw.tool_expectations === "object" &&
    !Array.isArray(runtimeDetailsRaw.tool_expectations)
      ? (runtimeDetailsRaw.tool_expectations as Record<string, unknown>)
      : null;
  const candidateToolExpectations = useMemo(() => {
    const raw = candidateSnapshot?.tool_expectations;
    if (!Array.isArray(raw)) return [] as Array<{
      name: string;
      toolType: string;
      baselineSampleSummary: string;
      resultGuide: string;
    }>;
    return raw
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        return {
          name: String(obj.name ?? "").trim(),
          toolType: String(obj.tool_type ?? "").trim().toLowerCase() || "retrieval",
          baselineSampleSummary: String(obj.baseline_sample_summary ?? "").trim(),
          resultGuide: String(obj.result_guide ?? "").trim(),
        };
      })
      .filter(
        (
          row
        ): row is {
          name: string;
          toolType: string;
          baselineSampleSummary: string;
          resultGuide: string;
        } => Boolean(row && row.name)
      );
  }, [candidateSnapshot]);
  const toolExpectationRows = useMemo(() => {
    const raw = toolExpectationDetail?.tools;
    if (!Array.isArray(raw)) return [] as Array<{
      name: string;
      toolType: string;
      configuredFields: string[];
      matchedFields: string[];
      missingFields: string[];
      status: string;
      evidenceRows: number;
      resultGuide: string;
      baselineSampleSummary: string;
    }>;
    const candidateByName = new Map(
      candidateToolExpectations.map(item => [
        `${item.toolType}:${item.name}`.toLowerCase(),
        item,
      ])
    );
    return raw
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        const toStringList = (value: unknown): string[] =>
          Array.isArray(value)
            ? value.map(v => String(v ?? "").trim()).filter(Boolean)
            : [];
        const toolType = String(obj.tool_type ?? "").trim().toLowerCase() || "retrieval";
        const name = String(obj.name ?? "").trim();
        const fromSnapshot = candidateByName.get(`${toolType}:${name}`.toLowerCase());
        return {
          name,
          toolType,
          configuredFields: toStringList(obj.configured_fields),
          matchedFields: toStringList(obj.matched_fields),
          missingFields: toStringList(obj.missing_fields),
          status: String(obj.status ?? "").trim().toLowerCase(),
          evidenceRows: Number.isFinite(Number(obj.evidence_rows)) ? Number(obj.evidence_rows) : 0,
          resultGuide:
            String(obj.result_guide ?? "").trim() || String(fromSnapshot?.resultGuide ?? "").trim(),
          baselineSampleSummary: String(fromSnapshot?.baselineSampleSummary ?? "").trim(),
        };
      })
      .filter(
        (
          row
        ): row is {
          name: string;
          toolType: string;
          configuredFields: string[];
          matchedFields: string[];
          missingFields: string[];
          status: string;
          evidenceRows: number;
          resultGuide: string;
          baselineSampleSummary: string;
        } => Boolean(row && row.name)
      );
  }, [toolExpectationDetail, candidateToolExpectations]);
  const responseDiffLines = useMemo(() => {
    if (!baselineResponse || !candidateResponse) return [];
    return computeSimpleLineDiff(baselineResponse, candidateResponse, 200);
  }, [baselineResponse, candidateResponse]);
  const addedDiffPreviewLines = useMemo(
    () =>
      responseDiffLines
        .filter(line => line.startsWith("+"))
        .map(line => line.substring(2).trim())
        .filter(Boolean),
    [responseDiffLines]
  );
  const removedDiffPreviewLines = useMemo(
    () =>
      responseDiffLines
        .filter(line => line.startsWith("-"))
        .map(line => line.substring(2).trim())
        .filter(Boolean),
    [responseDiffLines]
  );

  const pass = Boolean(attempt?.pass);
  const failedSignals = canonicalSignalRows.filter(r => r.status === "fail");
  const sequenceEdits = Number((attempt?.behavior_diff ?? {}).sequence_edit_distance ?? 0);
  const toolDivergencePct = Number((attempt?.behavior_diff ?? {}).tool_divergence_pct ?? 0);
  const toolDivergenceLabel = percentFromRate(toolDivergencePct / 100);
  const evalPassCount = signalsPassed.length;
  const evalTotalCount = canonicalSignalRows.length;
  const providerErrorPreview = String(
    (attempt?.replay?.provider_error as any)?.response_preview ?? ""
  ).trim();
  const providerErrorMessage = String(
    (attempt?.replay?.provider_error as any)?.message ?? ""
  ).trim();
  const responseDataKeys = Array.isArray((candidateSnapshot as any)?.response_data_keys)
    ? ((candidateSnapshot as any)?.response_data_keys as unknown[]).map(key => String(key))
    : [];
  const hasProviderError = Boolean(providerErrorPreview || providerErrorMessage);
  const inputChanged = baselineInput !== candidateInput;
  const baselineInputLineCount = baselineInput ? baselineInput.split("\n").length : 0;
  const candidateInputLineCount = candidateInput ? candidateInput.split("\n").length : 0;
  const baselineLineCount = baselineResponse ? baselineResponse.split("\n").length : 0;
  const candidateLineCount = candidateResponse ? candidateResponse.split("\n").length : 0;
  const diffRemovedCount = responseDiffLines.filter(line => line.startsWith("-")).length;
  const diffConfidenceMessage = (() => {
    if (baselineResponse && candidateResponse) return "Both final replies were captured.";
    if (!baselineResponse && !candidateResponse)
      return "Neither side produced a captured final reply.";
    return "One side is missing a captured final reply, so compare with caution.";
  })();
  const isResponseDiffCollapsible =
    baselineLineCount > RESPONSE_PREVIEW_LINE_LIMIT ||
    candidateLineCount > RESPONSE_PREVIEW_LINE_LIMIT ||
    responseDiffLines.length > RESPONSE_DIFF_LINE_LIMIT ||
    baselineResponse.length > RESPONSE_PREVIEW_CHAR_LIMIT ||
    candidateResponse.length > RESPONSE_PREVIEW_CHAR_LIMIT;
  const baselineResponseDisplay = baselineResponse
    ? showFullResponseDiff || !isResponseDiffCollapsible
      ? baselineResponse
      : truncateResponsePreview(baselineResponse)
    : baselineResponseStatus === "not_captured"
      ? `Baseline response not captured (${baselineCaptureReason || "no reason given"}).`
      : baselineResponseStatus === "empty"
        ? "The baseline finished without a final assistant reply."
        : "The baseline response preview is unavailable.";
  const candidateResponseDisplay = candidateResponse
    ? showFullResponseDiff || !isResponseDiffCollapsible
      ? candidateResponse
      : truncateResponsePreview(candidateResponse)
    : candidateResponseStatus === "tool_calls_only"
      ? "This attempt used tools but did not produce a final assistant reply."
      : candidateResponseStatus === "empty"
        ? "This attempt finished without a final assistant reply."
        : "The replay response preview is unavailable.";
  const finalReplyOutcome = (() => {
    if (candidateResponse) {
      return {
        label: "Final reply captured",
        detail: summarizeCompactPreview(candidateResponse, 240),
        toneClass: "border-l-2 border-cyan-500/50 bg-cyan-500/5 text-white/90",
      };
    }
    if (candidateResponseStatus === "tool_calls_only") {
      return {
        label: "No final reply after the tool call",
        detail: "The tool action is the main outcome for this attempt.",
        toneClass: "border-l-2 border-amber-500/50 bg-amber-500/5 text-white/90",
      };
    }
    if (candidateResponseStatus === "empty") {
      return {
        label: "Final reply was empty",
        detail: "The attempt finished without a user-facing assistant message.",
        toneClass: "border-l-2 border-amber-500/50 bg-amber-500/5 text-white/90",
      };
    }
    return {
      label: "Final reply preview unavailable",
      detail: "Review tool execution details if the main outcome happened through a tool.",
      toneClass: "border-white/10 bg-white/[0.03] text-white/90",
    };
  })();
  const visibleResponseDiffLines = useMemo(() => {
    const visibleLines = responseDiffLines.filter(
      line => showRemovedDiffLines || !line.startsWith("-")
    );
    if (showFullResponseDiff || !isResponseDiffCollapsible) return visibleLines;
    return visibleLines.slice(0, RESPONSE_DIFF_LINE_LIMIT);
  }, [responseDiffLines, showRemovedDiffLines, showFullResponseDiff, isResponseDiffCollapsible]);
  const hiddenResponseDiffLineCount = Math.max(
    0,
    responseDiffLines.filter(line => showRemovedDiffLines || !line.startsWith("-")).length -
      visibleResponseDiffLines.length
  );
  const gateConfidence = (() => {
    if (toolGroundingStatus === "fail") {
      return {
        label: "Low",
        detail:
          toolGroundingReason || "Tool results were not grounded into a stable final response.",
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
          "Tool calls were detected, but no recorded baseline tool results were present in the trace — evidence is dry-run (Simulated) only.",
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
        toneClass: "border-l-2 border-amber-500/50 bg-amber-500/5 text-white/90",
      };
    }
    return {
      label: "High",
      detail: "All core evidence channels are captured.",
      toneClass: "border-l-2 border-cyan-500/50 bg-cyan-500/5 text-white/90",
    };
  })();
  const decisionSummary = (() => {
    if (evalTotalCount === 0) return "No configured eval checks were returned for this attempt.";
    if (pass) return `All ${evalTotalCount} configured eval checks passed.`;
    const fragments = [`${failedSignals.length} of ${evalTotalCount} eval checks failed.`];
    if (policyRows.length > 0) {
      fragments.push(
        `${policyRows.length} tool policy issue${policyRows.length === 1 ? "" : "s"} also need review.`
      );
    }
    return fragments.join(" ");
  })();
  const resultToneClass = pass
    ? "border-l-2 border-emerald-500/50 bg-emerald-500/5 text-white/90"
    : "border-l-2 border-rose-500/50 bg-rose-500/5 text-white/90";
  const attentionItems = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      detail: string;
      tone: "neutral" | "warning" | "danger";
    }> = [];
    if (policyRows.length > 0) {
      items.push({
        key: "policy",
        label: "Policy",
        detail: `${policyRows.length} violation${policyRows.length === 1 ? "" : "s"} require review.`,
        tone: "danger",
      });
    }
    if (sequenceEdits > 0 || toolDivergencePct > 0) {
      items.push({
        key: "tool-divergence",
        label: "Behavior difference",
        detail: `${sequenceEdits} sequence edit${sequenceEdits === 1 ? "" : "s"} and ${toolDivergenceLabel} tool divergence.`,
        tone: "warning",
      });
    }
    if (gateConfidence.label !== "High") {
      items.push({
        key: "evidence",
        label: "Evidence quality",
        detail: gateConfidence.detail,
        tone: gateConfidence.label === "Medium" ? "warning" : "danger",
      });
    }
    if (providerErrorMessage) {
      items.push({
        key: "provider-warning",
        label: "Provider Warning",
        detail: providerErrorMessage,
        tone: "warning",
      });
    }
    return items;
  }, [
    policyRows.length,
    sequenceEdits,
    toolDivergencePct,
    toolDivergenceLabel,
    gateConfidence,
    providerErrorMessage,
  ]);
  const riskToneClass = (tone: "neutral" | "warning" | "danger"): string => {
    if (tone === "danger") return "border-rose-500/20 bg-rose-500/[0.05]";
    if (tone === "warning") return "border-amber-500/20 bg-amber-500/[0.05]";
    return "border-white/6 bg-black/20";
  };
  const toolBehaviorToneClass =
    policyRows.length > 0 || toolGroundingStatus === "fail"
      ? "border-rose-500/20 bg-rose-500/[0.05]"
      : toolEvidenceStatus === "calls_detected_no_execution" || hasProviderError
        ? "border-amber-500/20 bg-amber-500/[0.05]"
        : "border-white/6 bg-white/[0.02]";
  const toolBehaviorSummary =
    policyRows.length > 0
      ? `${policyRows.length} tool policy issue${policyRows.length === 1 ? "" : "s"} need review.`
      : toolTotalCalls > 0
        ? `${toolTotalCalls} tool call${toolTotalCalls === 1 ? " was" : "s were"} captured for this attempt.`
        : toolPolicyEnabled
          ? "Tools were available for this attempt, but no tool calls were captured."
          : "No tools were available for this attempt.";
  const hasToolBehaviorDetails =
    toolPolicyEnabled ||
    toolTotalCalls > 0 ||
    toolRecordedCount > 0 ||
    toolExecutedCount > 0 ||
    toolResultCount > 0 ||
    toolSimulatedCount > 0 ||
    toolSkippedCount > 0 ||
    toolFailedCount > 0 ||
    policyRows.length > 0 ||
    toolExpectationRows.length > 0 ||
    gateToolTimelineRows.length > 0;
  const isToolDrivenAttempt =
    toolTotalCalls > 0 ||
    toolResultCount > 0 ||
    toolFailedCount > 0 ||
    toolSimulatedCount > 0 ||
    toolSkippedCount > 0;
  const primaryToolCallRow = useMemo(() => {
    const loopRow = flattenedToolLoopRows.find(row => row.name || row.argumentsPreview);
    if (loopRow) {
      return {
        name: loopRow.name,
        argumentsPreview: loopRow.argumentsPreview,
        resultPreview: loopRow.resultPreview,
        executionSource: loopRow.executionSource,
        toolResultSource: loopRow.toolResultSource,
      };
    }
    const evidenceRow = toolEvidenceRows.find(
      row => String(row.name ?? "").trim() || String(row.arguments_preview ?? "").trim()
    );
    if (!evidenceRow) return null;
    return {
      name: String(evidenceRow.name ?? "").trim(),
      argumentsPreview: String(evidenceRow.arguments_preview ?? "").trim(),
      resultPreview: String(evidenceRow.result_preview ?? "").trim(),
      executionSource: String(evidenceRow.execution_source ?? evidenceRow.status ?? "").trim(),
      toolResultSource: String(evidenceRow.tool_result_source ?? "").trim(),
    };
  }, [flattenedToolLoopRows, toolEvidenceRows]);
  const primaryToolResultRow = useMemo(() => {
    const loopRow = flattenedToolLoopRows.find(row => row.resultPreview || row.name);
    if (loopRow) {
      return {
        name: loopRow.name,
        resultPreview: loopRow.resultPreview,
        executionSource: loopRow.executionSource,
        toolResultSource: loopRow.toolResultSource,
      };
    }
    const evidenceRow = toolEvidenceRows.find(
      row => String(row.result_preview ?? "").trim() || String(row.name ?? "").trim()
    );
    if (!evidenceRow) return null;
    return {
      name: String(evidenceRow.name ?? "").trim(),
      resultPreview: String(evidenceRow.result_preview ?? "").trim(),
      executionSource: String(evidenceRow.execution_source ?? evidenceRow.status ?? "").trim(),
      toolResultSource: String(evidenceRow.tool_result_source ?? "").trim(),
    };
  }, [flattenedToolLoopRows, toolEvidenceRows]);
  const primaryActionLabel = primaryToolCallRow?.name
    ? toolTotalCalls > 1
      ? `${primaryToolCallRow.name} + ${toolTotalCalls - 1} more`
      : primaryToolCallRow.name
    : toolTotalCalls > 0
      ? `${toolTotalCalls} tool call${toolTotalCalls === 1 ? "" : "s"}`
      : "No tool action captured";
  const primaryActionMeta = [
    primaryToolCallRow?.executionSource
      ? `Execution ${String(primaryToolCallRow.executionSource).replace(/_/g, " ")}`
      : null,
    primaryToolResultRow?.toolResultSource
      ? `Result source ${String(primaryToolResultRow.toolResultSource).replace(/_/g, " ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const actionRequestPreview = primaryToolCallRow?.argumentsPreview
    ? summarizeCompactPreview(primaryToolCallRow.argumentsPreview, 260)
    : "No tool input preview was captured for this attempt.";
  const actionResultPreview = primaryToolResultRow?.resultPreview
    ? summarizeCompactPreview(primaryToolResultRow.resultPreview, 260)
    : toolResultCount > 0
      ? "Tool results were counted, but no compact preview was stored for this row."
      : "No tool result preview was captured for this attempt.";
  const actionOutcome = (() => {
    if (toolFailedCount > 0) {
      return {
        label: "Tool execution needs review",
        detail: `${toolFailedCount} tool call${toolFailedCount === 1 ? "" : "s"} failed. ${toolEvidenceDetail}`,
        toneClass: "border-l-2 border-rose-500/50 bg-rose-500/5 text-white/90",
      };
    }
    if (toolGroundingStatus === "fail") {
      return {
        label: "Tool output was not grounded into a stable reply",
        detail: toolGroundingReason || toolEvidenceDetail,
        toneClass: "border-l-2 border-amber-500/50 bg-amber-500/5 text-white/90",
      };
    }
    if (toolSimulatedCount > 0 && toolExecutedCount === 0 && toolRecordedCount === 0) {
      return {
        label: "Only simulated tool evidence was captured",
        detail: toolEvidenceDetail,
        toneClass: "border-l-2 border-amber-500/50 bg-amber-500/5 text-white/90",
      };
    }
    if (toolExecutedCount > 0 || toolRecordedCount > 0 || toolResultCount > 0) {
      return {
        label: "Tool outcome captured",
        detail: toolEvidenceDetail,
        toneClass: "border-l-2 border-cyan-500/50 bg-cyan-500/5 text-white/90",
      };
    }
    return {
      label: "Tool calls detected",
      detail: toolEvidenceDetail,
      toneClass: "border-white/10 bg-white/[0.03] text-white/90",
    };
  })();
  const hasConfigurationChanges = useMemo(() => {
    if (!replayRequestMeta || typeof replayRequestMeta !== "object") return false;
    const overrides =
      replayRequestMeta.replay_overrides_applied &&
      typeof replayRequestMeta.replay_overrides_applied === "object"
        ? Object.keys(replayRequestMeta.replay_overrides_applied as Record<string, unknown>).length
        : 0;
    const perLogOverrides =
      replayRequestMeta.replay_overrides_by_snapshot_id_applied &&
      typeof replayRequestMeta.replay_overrides_by_snapshot_id_applied === "object"
        ? Object.keys(
            replayRequestMeta.replay_overrides_by_snapshot_id_applied as Record<
              string,
              Record<string, unknown>
            >
          ).length
        : 0;
    const samplingOverrides =
      replayRequestMeta.sampling_overrides &&
      typeof replayRequestMeta.sampling_overrides === "object"
        ? Object.keys(replayRequestMeta.sampling_overrides as Record<string, unknown>).length
        : 0;
    const hasNewPrompt = Boolean(replayRequestMeta.has_new_system_prompt);
    return overrides > 0 || perLogOverrides > 0 || samplingOverrides > 0 || hasNewPrompt;
  }, [replayRequestMeta]);
  const replayOverrideCount =
    replayRequestMeta?.replay_overrides_applied &&
    typeof replayRequestMeta.replay_overrides_applied === "object"
      ? Object.keys(replayRequestMeta.replay_overrides_applied as Record<string, unknown>).length
      : 0;
  const replayOverrideKeys = useMemo(() => {
    if (
      !replayRequestMeta?.replay_overrides_applied ||
      typeof replayRequestMeta.replay_overrides_applied !== "object"
    ) {
      return [];
    }
    return Object.keys(replayRequestMeta.replay_overrides_applied as Record<string, unknown>).sort();
  }, [replayRequestMeta?.replay_overrides_applied]);
  const replayPerLogOverrideEntries = useMemo(() => {
    if (
      !replayRequestMeta?.replay_overrides_by_snapshot_id_applied ||
      typeof replayRequestMeta.replay_overrides_by_snapshot_id_applied !== "object"
    ) {
      return [];
    }
    return Object.entries(
      replayRequestMeta.replay_overrides_by_snapshot_id_applied as Record<
        string,
        Record<string, unknown>
      >
    ).filter(([, value]) => value && typeof value === "object" && Object.keys(value).length > 0);
  }, [replayRequestMeta?.replay_overrides_by_snapshot_id_applied]);
  const replayPerLogOverrideCount = replayPerLogOverrideEntries.length;
  const replaySamplingSummary = useMemo(() => {
    const overrides =
      replayRequestMeta?.sampling_overrides &&
      typeof replayRequestMeta.sampling_overrides === "object"
        ? (replayRequestMeta.sampling_overrides as Record<string, unknown>)
        : null;
    if (!overrides) return null;
    const formatSamplingLabel = (key: string, value: unknown): string => {
      const text = String(value ?? "").trim();
      if (!text) return key;
      if (key === "temperature") return `Temperature ${text}`;
      if (key === "max_tokens") return `Max tokens ${text}`;
      if (key === "top_p") return `Top-p ${text}`;
      if (key === "presence_penalty") return `Presence penalty ${text}`;
      if (key === "frequency_penalty") return `Frequency penalty ${text}`;
      return `${key.replace(/_/g, " ")} ${text}`;
    };
    return Object.entries(overrides)
      .filter(([, value]) => value != null && String(value).trim().length > 0)
      .map(([key, value]) => formatSamplingLabel(key, value));
  }, [replayRequestMeta]);
  const overrideSummary = useMemo(() => {
    if (Boolean(replayRequestMeta?.has_new_system_prompt)) {
      return {
        summary: "This attempt used a system prompt override",
        meta: String(replayRequestMeta?.new_system_prompt_preview ?? "").trim() || undefined,
        tone: "changed" as const,
      };
    }
    if (baselineModel !== candidateModel) {
      return {
        summary: "This attempt used a model override",
        meta: `Baseline ${baselineModel} -> replay ${candidateModel}`,
        tone: "changed" as const,
      };
    }
    return {
      summary: "No model or prompt override was applied",
      meta: `Using model ${baselineModel}`,
      tone: "default" as const,
    };
  }, [replayRequestMeta, baselineModel, candidateModel]);
  const normalizedToolContext =
    toolContext && typeof toolContext === "object" && !Array.isArray(toolContext)
      ? (toolContext as Record<string, unknown>)
      : attempt?.experiment &&
          typeof attempt.experiment === "object" &&
          !Array.isArray(attempt.experiment) &&
          (attempt.experiment as Record<string, unknown>).tool_context &&
          typeof (attempt.experiment as Record<string, unknown>).tool_context === "object" &&
          !Array.isArray((attempt.experiment as Record<string, unknown>).tool_context)
        ? ((attempt.experiment as Record<string, unknown>).tool_context as Record<string, unknown>)
        : null;
  const toolContextModeValue = String(normalizedToolContext?.mode ?? "recorded")
    .trim()
    .toLowerCase();
  const toolContextInject =
    normalizedToolContext?.inject &&
    typeof normalizedToolContext.inject === "object" &&
    !Array.isArray(normalizedToolContext.inject)
      ? (normalizedToolContext.inject as Record<string, unknown>)
      : null;
  const toolContextScopeValue = String(toolContextInject?.scope ?? "per_snapshot")
    .trim()
    .toLowerCase();
  const toolContextGlobalText = String(toolContextInject?.global_text ?? "").trim();
  const toolContextBySnapshot =
    toolContextInject?.by_snapshot_id &&
    typeof toolContextInject.by_snapshot_id === "object" &&
    !Array.isArray(toolContextInject.by_snapshot_id)
      ? (toolContextInject.by_snapshot_id as Record<string, unknown>)
      : {};
  const toolContextCustomEntries = Object.entries(toolContextBySnapshot).filter(
    ([, value]) => typeof value === "string" && value.trim().length > 0
  );
  const hasToolContextDetails =
    toolContextModeValue === "inject" ||
    toolContextGlobalText.length > 0 ||
    toolContextCustomEntries.length > 0;
  const toolContextSummary = (() => {
    if (!hasToolContextDetails) return "No extra context was added.";
    if (toolContextModeValue !== "inject") return "Using the recorded request only.";
    if (toolContextScopeValue === "global") {
      return toolContextGlobalText
        ? "Shared extra context was added for every replayed input."
        : "Shared extra context was configured for this run.";
    }
    const parts = [
      `${toolContextCustomEntries.length} input${toolContextCustomEntries.length === 1 ? "" : "s"} received extra context`,
    ];
    if (toolContextGlobalText) parts.push("with shared fallback context");
    return parts.join(", ");
  })();
  const toolContextScopeLabel =
    toolContextModeValue !== "inject"
      ? "Not applicable"
      : toolContextScopeValue === "global"
        ? "Entire run"
        : "Per input";
  const hasAdditionalDetails =
    attentionItems.length > 0 ||
    hasToolBehaviorDetails ||
    hasConfigurationChanges ||
    hasToolContextDetails;
  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const inputSetupRows = useMemo(() => {
    const rows: Array<{
      id: string;
      label: string;
      summary: string;
      meta?: string;
      scope: string;
      tone?: "default" | "changed";
      action?: "diff" | "details" | "tools";
    }> = [];

    rows.push({
      id: "user-input",
      label: "User input",
      summary: inputChanged
        ? "Prompt text changed from the baseline"
        : "Uses the same prompt as the baseline",
      meta: inputChanged
        ? `Baseline ${baselineInputLineCount} lines, replay ${candidateInputLineCount} lines`
        : `${candidateInputLineCount} captured line${candidateInputLineCount === 1 ? "" : "s"}`,
      scope: "Entire run",
      tone: inputChanged ? "changed" : "default",
    });

    rows.push({
      id: "sampling",
      label: "Sampling",
      summary:
        replaySamplingSummary && replaySamplingSummary.length > 0
          ? "Sampling settings were changed for this run"
          : "Uses the same default sampling settings as the baseline",
      meta:
        replaySamplingSummary && replaySamplingSummary.length > 0
          ? replaySamplingSummary.join(" · ")
          : undefined,
      scope: "Entire run",
      tone: replaySamplingSummary && replaySamplingSummary.length > 0 ? "changed" : "default",
      action: replaySamplingSummary && replaySamplingSummary.length > 0 ? "details" : undefined,
    });

    const toolMetaParts: string[] = [];
    if (toolTotalCalls > 0) {
      toolMetaParts.push(`${toolExecutedCount} executed`);
      toolMetaParts.push(`${toolRecordedCount} recorded`);
      if (toolSimulatedCount > 0) toolMetaParts.push(`${toolSimulatedCount} simulated`);
      if (toolFailedCount > 0) toolMetaParts.push(`${toolFailedCount} failed`);
    } else if (toolPolicyEnabled) {
      toolMetaParts.push("No tool calls were captured.");
    }
    if (toolExpectationRows.length > 0) {
      const fullyMatchedCount = toolExpectationRows.filter(row => row.missingFields.length === 0).length;
      toolMetaParts.push(`Expectations ${fullyMatchedCount}/${toolExpectationRows.length} matched`);
    }

    rows.push({
      id: "tools",
      label: "Tools",
      summary:
        toolTotalCalls > 0
          ? `${toolTotalCalls} tool call${toolTotalCalls === 1 ? " was" : "s were"} captured for this attempt`
          : toolPolicyEnabled
            ? "Tools are available for this attempt"
            : "No tools were available for this attempt",
      meta: toolMetaParts.join(" · ") || undefined,
      scope:
        toolRecordedCount !== toolTotalCalls && toolTotalCalls > 0 ? "Mixed scope" : "Entire run",
      tone:
        toolFailedCount > 0 || (toolTotalCalls > 0 && toolRecordedCount !== toolTotalCalls)
          ? "changed"
          : "default",
      action: hasToolBehaviorDetails ? "tools" : undefined,
    });

    rows.push({
      id: "override",
      label: "Overrides",
      summary: overrideSummary.summary,
      meta: overrideSummary.meta,
      scope: "Entire run",
      tone: overrideSummary.tone,
      action:
        Boolean(replayRequestMeta?.has_new_system_prompt) || baselineModel !== candidateModel
          ? "details"
          : undefined,
    });

    if (replayOverrideCount > 0 || replayPerLogOverrideCount > 0) {
      rows.push({
        id: "extra-request",
        label: "Extra request fields",
        summary:
          replayOverrideCount > 0 && replayPerLogOverrideCount > 0
            ? "Shared request data changed and some inputs use custom values"
            : replayOverrideCount > 0
              ? `Shared request data changed (${replayOverrideCount} field${replayOverrideCount === 1 ? "" : "s"})`
              : `${replayPerLogOverrideCount} input${replayPerLogOverrideCount === 1 ? " uses" : "s use"} custom request values`,
        meta:
          replayOverrideKeys.length > 0
            ? replayOverrideKeys.slice(0, 3).join(", ")
            : replayPerLogOverrideEntries
                .slice(0, 2)
                .map(
                  ([sid, value]) =>
                    `Input ${sid} (${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"})`
                )
                .join(" · "),
        scope:
          replayOverrideCount > 0 && replayPerLogOverrideCount > 0
            ? "Mixed scope"
            : replayPerLogOverrideCount > 0
              ? "Per input"
              : "Entire run",
        tone: "changed",
        action: "details",
      });
    }

    if (hasToolContextDetails) {
      rows.push({
        id: "extra-context",
        label: "Extra system text",
        summary:
          toolContextScopeValue === "global"
            ? "Shared context was added for this run"
            : `${toolContextCustomEntries.length} input${toolContextCustomEntries.length === 1 ? "" : "s"} received extra context`,
        meta:
          toolContextModeValue === "inject"
            ? toolContextGlobalText
              ? "Includes shared fallback text"
              : "Only per-input guidance was added"
            : "Using the recorded request only",
        scope:
          toolContextScopeValue === "global"
            ? "Entire run"
            : toolContextModeValue === "inject"
              ? "Per input"
              : "Entire run",
        tone: toolContextModeValue === "inject" ? "changed" : "default",
        action: "details",
      });
    }

    return rows;
  }, [
    inputChanged,
    baselineInputLineCount,
    candidateInputLineCount,
    baselineModel,
    candidateModel,
    replaySamplingSummary,
    toolPolicyEnabled,
    toolRecordedCount,
    toolTotalCalls,
    toolFailedCount,
    toolSimulatedCount,
    toolExecutedCount,
    overrideSummary,
    replayOverrideCount,
    replayPerLogOverrideCount,
    replayOverrideKeys,
    replayPerLogOverrideEntries,
    hasToolContextDetails,
    hasToolBehaviorDetails,
    toolContextModeValue,
    toolContextScopeValue,
    toolContextGlobalText,
    toolContextCustomEntries,
    replayRequestMeta,
    toolExpectationRows,
  ]);
  const diffFocusBySignal = useMemo(() => {
    const preview = (lines: string[]): string | null =>
      lines.length > 0 ? lines.slice(0, 2).join(" / ") : null;

    return Object.fromEntries(
      failedSignals.map(row => {
        let detail = "";

        if (row.id === "required") {
          detail =
            preview(removedDiffPreviewLines) ||
            preview(addedDiffPreviewLines) ||
            "Check missing fields against the removed baseline lines and changed candidate output.";
        } else if (row.id === "format" || row.id === "json") {
          detail =
            preview(addedDiffPreviewLines) ||
            preview(removedDiffPreviewLines) ||
            "Compare the response structure and opening/closing lines against the baseline.";
        } else if (row.id === "length") {
          detail =
            baselineLineCount !== candidateLineCount
              ? `Baseline ${baselineLineCount} lines vs candidate ${candidateLineCount} lines.`
              : `Baseline ${baselineResponse.length} chars vs candidate ${candidateResponse.length} chars.`;
        } else if (row.id === "repetition") {
          detail =
            preview(addedDiffPreviewLines) ||
            "Inspect repeated candidate lines in the diff to confirm looped or duplicated output.";
        } else if (row.id === "empty") {
          detail =
            candidateResponse.length === 0
              ? "Candidate response preview is empty."
              : `Candidate preview captured ${candidateResponse.length} chars. Compare against the baseline body below.`;
        } else {
          detail =
            preview(addedDiffPreviewLines) ||
            preview(removedDiffPreviewLines) ||
            "Use the response diff below to inspect the changed output for this check.";
        }

        return [row.id, detail];
      })
    ) as Record<string, string>;
  }, [
    failedSignals,
    removedDiffPreviewLines,
    addedDiffPreviewLines,
    baselineLineCount,
    candidateLineCount,
    baselineResponse,
    candidateResponse,
  ]);
  const primaryFailedSignal = failedSignals[0] ?? null;
  const primaryFailureEvidence = primaryFailedSignal
    ? formatSignalWhy(primaryFailedSignal.id, (signalsDetailsRaw as any)?.[primaryFailedSignal.id])
    : pass
      ? "No eval check failed for this attempt."
      : "A failed check was detected, but detailed evidence was not captured.";
  const primaryFailureMetric = primaryFailedSignal
    ? formatSignalMetric(primaryFailedSignal.id, (signalsDetailsRaw as any)?.[primaryFailedSignal.id])
    : null;
  const primaryFailureFocus = primaryFailedSignal
    ? diffFocusBySignal[primaryFailedSignal.id] || ""
    : "";
  const responseDiffSummary = (() => {
    if (!primaryFailedSignal) {
      return "Baseline and replay replies were captured for comparison.";
    }
    if (primaryFailedSignal.id === "length") {
      return `Replay reply length changed from ${baselineLineCount} baseline line${baselineLineCount === 1 ? "" : "s"} to ${candidateLineCount} replay line${candidateLineCount === 1 ? "" : "s"}.`;
    }
    if (primaryFailedSignal.id === "repetition") {
      return "Replay repeated content that did not appear in the baseline reply.";
    }
    if (primaryFailedSignal.id === "format" || primaryFailedSignal.id === "json") {
      return "Replay changed the reply structure before the content itself.";
    }
    if (primaryFailedSignal.id === "required") {
      return "Replay dropped information that was present in the baseline reply.";
    }
    if (primaryFailedSignal.id === "empty") {
      return "Baseline had content, but replay came back empty or near-empty.";
    }
    return primaryFailureEvidence;
  })();
  const toolImpactSummary = (() => {
    if (toolTotalCalls > 0) {
      const matchedCount = toolExpectationRows.filter(row => row.missingFields.length === 0).length;
      const detailParts = [
        `${toolTotalCalls} tool call${toolTotalCalls === 1 ? "" : "s"} captured`,
        toolExecutedCount > 0 ? `${toolExecutedCount} executed` : null,
        toolRecordedCount > 0 ? `${toolRecordedCount} recorded` : null,
        toolSimulatedCount > 0 ? `${toolSimulatedCount} simulated` : null,
        toolResultCount > 0 ? `${toolResultCount} results` : null,
        toolExpectationRows.length > 0
          ? `${matchedCount}/${toolExpectationRows.length} setup item${toolExpectationRows.length === 1 ? "" : "s"} matched`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        title: "Tool impact",
        summary:
          toolGroundingStatus === "fail"
            ? "Tool output did not ground into a stable final reply."
            : "Tool calls were part of this attempt.",
        detail: detailParts || toolEvidenceDetail,
        toneClass:
          toolGroundingStatus === "fail"
            ? "border-rose-500/20 bg-rose-500/[0.05] text-rose-100"
            : "border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-100",
      };
    }
    if (toolContextModeValue === "inject" || toolContextGlobalText || toolContextCustomEntries.length) {
      return {
        title: "Tool impact",
        summary:
          toolContextModeValue === "inject"
            ? "Extra context was added to the replay."
            : "No extra context was added.",
        detail: toolContextSummary,
        toneClass:
          toolContextModeValue === "inject"
            ? "border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-100"
            : "border-white/10 bg-white/[0.03] text-white/80",
      };
    }
    if (toolExpectationRows.length > 0) {
      const matchedCount = toolExpectationRows.filter(row => row.missingFields.length === 0).length;
      return {
        title: "Tool impact",
        summary: "Tool setup was configured for this attempt.",
        detail: `${matchedCount}/${toolExpectationRows.length} setup item${toolExpectationRows.length === 1 ? "" : "s"} matched the captured evidence.`,
        toneClass: "border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-100",
      };
    }
    return null;
  })();
  const diffExamplesBySignal = useMemo(() => {
    type DiffExample = { tone: "added" | "removed"; label: string; text: string };
    const repeatCandidateLine =
      addedDiffPreviewLines.find(
        (line, idx, arr) => arr.findIndex(other => other === line) !== idx
      ) ?? null;

    return Object.fromEntries(
      failedSignals.map(row => {
        const examples: DiffExample[] = [];
        const firstAdded = addedDiffPreviewLines[0];
        const secondAdded = addedDiffPreviewLines[1];
        const firstRemoved = removedDiffPreviewLines[0];
        const secondRemoved = removedDiffPreviewLines[1];

        if (row.id === "required") {
          if (firstRemoved)
            examples.push({ tone: "removed", label: "Missing from candidate", text: firstRemoved });
          if (firstAdded)
            examples.push({ tone: "added", label: "Candidate changed to", text: firstAdded });
        } else if (row.id === "format" || row.id === "json") {
          if (firstRemoved)
            examples.push({ tone: "removed", label: "Baseline structure", text: firstRemoved });
          if (firstAdded)
            examples.push({ tone: "added", label: "Candidate structure", text: firstAdded });
        } else if (row.id === "length") {
          if (firstAdded)
            examples.push({ tone: "added", label: "Extra candidate line", text: firstAdded });
          if (firstRemoved)
            examples.push({ tone: "removed", label: "Missing baseline line", text: firstRemoved });
        } else if (row.id === "repetition") {
          if (repeatCandidateLine) {
            examples.push({
              tone: "added",
              label: "Repeated candidate line",
              text: repeatCandidateLine,
            });
          } else if (firstAdded) {
            examples.push({ tone: "added", label: "Candidate repeated content", text: firstAdded });
          }
          if (secondAdded)
            examples.push({ tone: "added", label: "Nearby changed line", text: secondAdded });
        } else if (row.id === "empty") {
          if (firstRemoved)
            examples.push({
              tone: "removed",
              label: "Expected baseline content",
              text: firstRemoved,
            });
        }

        return [row.id, examples.slice(0, 2)];
      })
    ) as Record<string, DiffExample[]>;
  }, [failedSignals, addedDiffPreviewLines, removedDiffPreviewLines]);

  useEffect(() => {
    if (!open) return;
    setShowToolBehaviorDetails(false);
    setShowFullResponseDiff(false);
  }, [open, navIndex]);

  if (!open) return null;

  const detailTabs = [
    { id: "review" as const, label: "Review" },
    { id: "debug" as const, label: "Diagnostics" },
  ];
  const decisionLabel = pass ? "Gate passed" : "Gate failed";
  const attemptLabel = `Attempt ${navIndex + 1}${attemptCount > 1 ? ` of ${attemptCount}` : ""}`;

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md sm:p-6">
      <div className="flex h-[90vh] w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0c] shadow-2xl">
        <div className="flex shrink-0 flex-col gap-4 border-b border-white/8 px-6 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-white/30">Attempt review</div>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-semibold text-white text-balance">{decisionLabel}</h2>
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    pass
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  )}
                >
                  {pass ? "Passed" : "Failed"}
                </span>
              </div>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">{decisionSummary}</p>
              {!pass ? (
                <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-200/80">
                    Primary reason
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    {primaryFailedSignal?.label || "Failure reason unavailable"}
                  </div>
                  <div className="mt-2 text-[11px] leading-relaxed text-white/80">
                    {primaryFailureEvidence}
                  </div>
                  {primaryFailureMetric ? (
                    <div className="mt-2 text-[11px] font-medium text-white/40">
                      {primaryFailureMetric}
                    </div>
                  ) : null}
                  {primaryFailureFocus ? (
                    <div className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-white/55">
                      {primaryFailureFocus}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div
                role="tablist"
                aria-label="Attempt detail tabs"
                className="hidden shrink-0 flex-wrap items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1 md:flex"
              >
                {detailTabs.map(tab => {
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={detailMainTab === tab.id}
                      onClick={() => setDetailMainTab(tab.id)}
                      className={clsx(
                        "rounded-lg px-4 py-1.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70",
                        detailMainTab === tab.id
                          ? "bg-white/[0.12] text-white shadow-sm"
                          : "text-white/40 hover:bg-white/[0.06] hover:text-white/80"
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-[11px] font-semibold text-white/60 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
              >
                Close
              </button>
            </div>
          </div>

          {attemptCount > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-white/80">{attemptLabel}</div>
                <div className="mt-1 text-xs text-white/30">
                  {failedOnly
                    ? "Showing failed attempts only."
                    : "Browsing all attempts for this input."}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNavIndex(v => Math.max(0, v - 1))}
                  disabled={navIndex <= 0}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/60 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous attempt"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAttemptMenuOpen(!attemptMenuOpen)}
                    className="flex min-w-[180px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
                  >
                    <span>{attemptLabel}</span>
                    <ChevronDown
                      className={clsx(
                        "h-4 w-4 text-white/40 transition-transform",
                        attemptMenuOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {attemptMenuOpen && (
                    <div className="absolute left-0 top-full z-[12000] mt-2 w-72 rounded-xl border border-white/10 bg-[#1e2028] p-2 shadow-2xl">
                      <div className="mb-2 flex items-center justify-between px-2 pt-1">
                        <span className="text-[11px] font-semibold text-white/40">Attempts</span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setFailedOnly(!failedOnly);
                          }}
                          className={clsx(
                            "rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                            failedOnly
                              ? "border-rose-500/30 bg-rose-500/20 text-rose-200"
                              : "border-white/10 text-white/40 hover:text-white/80"
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
                                setAttemptMenuOpen(false);
                              }}
                              className={clsx(
                                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition",
                                navIndex === i
                                  ? "bg-white/10 text-white"
                                  : "text-white/60 hover:bg-white/5"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {isPass ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                ) : (
                                  <ShieldX className="h-4 w-4 text-rose-400" />
                                )}
                                <span>{`Attempt ${i + 1}`}</span>
                              </div>
                              {navIndex === i ? (
                                <span className="text-[10px] text-white/30">Current</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setNavIndex(v => Math.min(maxNav, v + 1))}
                  disabled={navIndex >= maxNav}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-white/60 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next attempt"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Tab Fallback */}
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/8 px-4 py-2.5 md:hidden">
          {detailTabs.map(tab => {
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
                    : "text-white/40 hover:bg-white/[0.06] hover:text-white/80"
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
              {detailMainTab === "review" ? (
                <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
                  <section className="py-6 border-b border-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium text-white/40">
                          What changed from baseline
                        </div>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          Input &amp; setup diff
                        </h3>
                      </div>
                      <div className="text-[11px] text-white/30">
                        Start with the failure reason, then compare the replay setup and reply.
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                      <div className={clsx("rounded-r-lg px-4 py-4", resultToneClass)}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                              Gate result
                            </div>
                            <div className="mt-1 text-sm font-medium text-white">
                              {decisionSummary}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="inline-flex rounded-md bg-white/5 px-2.5 py-1 text-white/90">
                              Eval {evalTotalCount > 0 ? `${evalPassCount}/${evalTotalCount}` : "—"}
                            </span>
                            <span className="inline-flex rounded-md bg-white/5 px-2.5 py-1 text-white/90">
                              Output {baselineLineCount} {"->"} {candidateLineCount} lines
                            </span>
                          </div>
                        </div>
                      </div>
                      <div
                        className={clsx("rounded-r-lg px-4 py-4", gateConfidence.toneClass)}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                          Evidence quality
                        </div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {gateConfidence.label}
                        </div>
                        <div className="mt-2 text-[11px] leading-relaxed text-white/80">
                          {gateConfidence.detail}
                        </div>
                      </div>
                    </div>
                    {toolImpactSummary ? (
                      <div className={clsx("mt-4 rounded-2xl border px-4 py-4", toolImpactSummary.toneClass)}>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                          {toolImpactSummary.title}
                        </div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {toolImpactSummary.summary}
                        </div>
                        <div className="mt-2 text-[11px] leading-relaxed text-white/80">
                          {toolImpactSummary.detail}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4">
                      {inputChanged ? (
                        <div className="grid gap-4 xl:grid-cols-2">
                          <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                              <span className="text-[11px] font-semibold text-white/40">
                                Baseline input
                              </span>
                              <span className="text-[10px] text-white/30">
                                {baselineInputLineCount} lines
                              </span>
                            </div>
                            <pre
                              className={clsx(
                                "custom-scrollbar whitespace-pre-wrap break-words px-4 py-4 text-sm leading-relaxed text-white/60",
                                !userInputExpanded && "line-clamp-6"
                              )}
                            >
                              {baselineInput}
                            </pre>
                          </div>
                          <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05]">
                            <div className="flex items-center justify-between border-b border-fuchsia-500/10 px-4 py-3">
                              <span className="text-[11px] font-semibold text-fuchsia-100">
                                Replay input
                              </span>
                              <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-100">
                                Changed
                              </span>
                            </div>
                            <pre
                              className={clsx(
                                "custom-scrollbar whitespace-pre-wrap break-words px-4 py-4 text-sm leading-relaxed text-white/90",
                                !userInputExpanded && "line-clamp-6"
                              )}
                            >
                              {candidateInput}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium text-white">
                                User input matched the baseline.
                              </div>
                              <div className="mt-1 text-[11px] text-white/30">
                                Same prompt text was replayed for this attempt.
                              </div>
                            </div>
                            <span className="rounded-md bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/60">
                              {candidateInputLineCount} lines
                            </span>
                          </div>
                          <pre
                            className={clsx(
                              "custom-scrollbar mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/60",
                              !userInputExpanded && "line-clamp-6"
                            )}
                          >
                            {candidateInput}
                          </pre>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setUserInputExpanded(v => !v)}
                        className="mt-3 text-[11px] font-medium text-fuchsia-400/80 transition-colors hover:text-fuchsia-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                      >
                        {userInputExpanded ? "Collapse input preview" : "Expand input preview"}
                      </button>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-xl border border-white/5">
                      {inputSetupRows.length > 0 ? (
                        inputSetupRows.map((row, idx) => {
                          const actionLabel =
                            row.action === "tools"
                              ? "View tool details"
                              : row.action === "details"
                                ? "View details"
                                : null;
                          const Container = row.action ? "button" : "div";
                          return (
                            <Container
                              key={row.id}
                              type={row.action ? "button" : undefined}
                              onClick={
                                row.action
                                  ? () => {
                                      if (row.action === "diff") {
                                        scrollToSection(diffSectionRef);
                                      } else if (row.action === "tools") {
                                        setShowToolBehaviorDetails(true);
                                        scrollToSection(toolBehaviorSectionRef);
                                      } else {
                                        scrollToSection(detailsSectionRef);
                                      }
                                    }
                                  : undefined
                              }
                              className={clsx(
                                "grid w-full gap-3 px-4 py-3 text-left sm:grid-cols-[180px_minmax(0,1fr)_auto]",
                                idx > 0 && "border-t border-white/5",
                                row.action && "transition hover:bg-white/[0.02]",
                                row.tone === "changed" ? "bg-white/[0.01]" : "bg-transparent"
                              )}
                            >
                              <div className="text-sm font-medium text-white/80">{row.label}</div>
                              <div className="min-w-0">
                                <div className="text-sm text-white/90">{row.summary}</div>
                                {row.meta ? (
                                  <div className="mt-1 line-clamp-2 text-xs text-white/30">
                                    {row.meta}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex items-center justify-between gap-3 sm:justify-end">
                                <span
                                  className={clsx(
                                    "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                                    row.tone === "changed"
                                      ? "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-100"
                                      : "border-white/10 bg-black/20 text-white/40"
                                  )}
                                >
                                  {row.scope}
                                </span>
                                {actionLabel ? (
                                  <span className="text-[11px] font-medium text-white/40">
                                    {actionLabel}
                                  </span>
                                ) : null}
                              </div>
                            </Container>
                          );
                        })
                      ) : (
                        <div className="px-4 py-6 text-sm text-white/30">
                          No meaningful base vs replay changes were captured.
                        </div>
                      )}
                    </div>
                  </section>

                  {isToolDrivenAttempt ? (
                    <section className="py-6 border-b border-white/5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="max-w-3xl">
                          <div className="text-xs font-medium text-white/40">Tool outcome</div>
                          <h3 className="mt-2 text-lg font-semibold text-white">Action summary</h3>
                          <p className="mt-2 text-sm leading-6 text-white/60">
                            This attempt relied on tool execution, so review the action and outcome
                            before the final reply.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-white/40">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1">
                            Calls {toolTotalCalls}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1">
                            Executed {toolExecutedCount}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1">
                            Results {toolResultCount}
                          </span>
                          {toolSimulatedCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1">
                              Simulated {toolSimulatedCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                        <div
                          className={clsx("rounded-r-lg px-4 py-4", actionOutcome.toneClass)}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                            Action status
                          </div>
                          <div className="mt-1 text-sm font-medium text-white">
                            {actionOutcome.label}
                          </div>
                          <div className="mt-2 text-[11px] leading-relaxed text-white/80">
                            {actionOutcome.detail}
                          </div>
                        </div>
                        <div
                          className={clsx(
                            "rounded-r-lg px-4 py-4",
                            finalReplyOutcome.toneClass
                          )}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                            Final reply status
                          </div>
                          <div className="mt-1 text-sm font-medium text-white">
                            {finalReplyOutcome.label}
                          </div>
                          <div className="mt-2 text-[11px] leading-relaxed text-white/80">
                            {finalReplyOutcome.detail}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-4">
                          <div className="text-[11px] font-medium text-white/30">
                            Primary action
                          </div>
                          <div className="mt-2 text-sm font-medium text-white/90">
                            {primaryActionLabel}
                          </div>
                          <div className="mt-2 text-[11px] leading-relaxed text-white/40">
                            {primaryActionMeta ||
                              "Execution metadata was not captured for the primary tool row."}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-4">
                          <div className="text-[11px] font-medium text-white/30">
                            Requested content
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/60">
                            {actionRequestPreview}
                          </pre>
                        </div>
                        <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-4">
                          <div className="text-[11px] font-medium text-white/30">Tool result</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/60">
                            {actionResultPreview}
                          </pre>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => scrollToSection(diffSectionRef)}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                        >
                          Jump to final reply
                        </button>
                        {hasToolBehaviorDetails ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowToolBehaviorDetails(true);
                              scrollToSection(toolBehaviorSectionRef);
                            }}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                          >
                            Open tool details
                          </button>
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  <section className="py-6 border-b border-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium text-white/40">Detailed checks</div>
                        <h3 className="mt-2 text-lg font-semibold text-white">Check details</h3>
                      </div>
                      <div className="text-[11px] text-white/30">
                        All configured eval checks are shown below.
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/40">
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-200">
                        Failed {failedSignals.length}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
                        Passed {signalsPassed.length}
                      </span>
                      {runtimeSignalRows.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-fuchsia-100">
                          Extra diagnostics {runtimeSignalRows.length}
                        </span>
                      ) : null}
                    </div>
                    {runtimeSignalRows.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.06] px-4 py-3 text-[11px] leading-relaxed text-fuchsia-100/85">
                        {runtimeSignalRows.length} extra runtime diagnostic
                        {runtimeSignalRows.length === 1 ? "" : "s"} are shown for debugging only and
                        do not count toward gate coverage.
                      </div>
                    ) : null}
                    {!signalsChecksRaw ? (
                      <div className="mt-4 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-5 text-sm text-white/30">
                        No eval signals returned for this attempt.
                      </div>
                    ) : canonicalSignalRows.length === 0 ? (
                      <div className="mt-4 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-5 text-sm text-white/30">
                        No configured eval checks were returned for this attempt.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {canonicalSignalRows.map(row => {
                          const failed = row.status === "fail";
                          const barNode = signalsDetailsRaw
                            ? formatSignalValue(
                                row.id,
                                (signalsDetailsRaw as any)?.[row.id],
                                row.pass
                              )
                            : null;
                          const evidenceText = signalsDetailsRaw
                            ? formatSignalWhy(row.id, (signalsDetailsRaw as any)?.[row.id])
                            : "Evidence unavailable for this check.";
                          const metricText = signalsDetailsRaw
                            ? formatSignalMetric(row.id, (signalsDetailsRaw as any)?.[row.id])
                            : null;
                          const diffFocus = diffFocusBySignal[row.id];
                          const diffExamples = diffExamplesBySignal[row.id] ?? [];
                          const showsDiffEvidence = [
                            "required",
                            "format",
                            "length",
                            "repetition",
                            "empty",
                          ].includes(row.id);
                          if (!failed) {
                            return (
                              <div
                                key={row.id}
                                className="grid gap-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-3 md:grid-cols-[minmax(0,180px)_80px_minmax(0,1fr)_minmax(0,220px)] md:items-center"
                              >
                                <div className="text-sm font-medium text-white/90">
                                  {row.label}
                                </div>
                                <div>
                                  <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
                                    Pass
                                  </span>
                                </div>
                                <div className="min-w-0 text-sm text-white/40">{evidenceText}</div>
                                <div className="text-xs text-white/30">
                                  {metricText || "Within threshold"}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <details
                              key={row.id}
                              className="rounded-xl border border-rose-500/20 bg-[#0a0a0c]"
                            >
                              <summary className="list-none cursor-pointer px-4 py-3 [&::-webkit-details-marker]:hidden">
                                <div className="grid gap-3 md:grid-cols-[minmax(0,180px)_80px_minmax(0,1fr)_minmax(0,220px)_auto] md:items-center">
                                  <div className="text-sm font-medium text-white/90">
                                    {row.label}
                                  </div>
                                  <div>
                                    <span
                                      className={clsx(
                                        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                                        failed
                                          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                                          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                                      )}
                                    >
                                      {failed ? "Fail" : "Pass"}
                                    </span>
                                  </div>
                                  <div className="min-w-0 line-clamp-2 text-sm text-white/60">
                                    {evidenceText}
                                  </div>
                                  <div className="text-xs text-white/30">
                                    {metricText || "See evidence"}
                                  </div>
                                  <div className="text-[11px] font-medium text-white/30">
                                    {showsDiffEvidence ? "Review" : "Details"}
                                  </div>
                                </div>
                              </summary>
                              <div className="border-t border-white/5 px-4 py-4">
                                <div className="space-y-3">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
                                      <div className="text-xs font-semibold text-white/40">
                                        Evidence
                                      </div>
                                      <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
                                        {evidenceText}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
                                      <div className="text-xs font-semibold text-white/40">
                                        Metric
                                      </div>
                                      <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
                                        {metricText ||
                                          "Structured metric unavailable for this check."}
                                      </p>
                                    </div>
                                  </div>
                                  {barNode ? <div>{barNode}</div> : null}
                                  {showsDiffEvidence && diffFocus ? (
                                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
                                      <div className="text-xs font-semibold text-white/40">
                                        Diff focus
                                      </div>
                                      <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
                                        {diffFocus}
                                      </p>
                                    </div>
                                  ) : null}
                                  {showsDiffEvidence && diffExamples.length > 0 ? (
                                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
                                      <div className="text-xs font-semibold text-white/40">
                                        Relevant lines
                                      </div>
                                      <div className="mt-2 space-y-1.5">
                                        {diffExamples.slice(0, 1).map((example, idx) => (
                                          <div
                                            key={`${row.id}-${example.tone}-${idx}`}
                                            className="text-[11px] leading-relaxed text-white/60"
                                          >
                                            <span
                                              className={clsx(
                                                "mr-1 font-semibold",
                                                example.tone === "added"
                                                  ? "text-emerald-400"
                                                  : "text-rose-400"
                                              )}
                                            >
                                              {example.label}:
                                            </span>
                                            {example.text}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                  {showsDiffEvidence ? (
                                    <button
                                      type="button"
                                      onClick={() => scrollToSection(diffSectionRef)}
                                      className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                                    >
                                      Jump to diff
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section
                    ref={diffSectionRef}
                    className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="text-xs font-medium text-white/40">Final reply</div>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          Assistant reply changes
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-white/60">
                          Compare the user-facing assistant reply after the attempt finished.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white/90">Reply comparison</p>
                        <p className="mt-1 text-[11px] text-white/30">{diffConfidenceMessage}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                        <span>Green marks lines added by the replay.</span>
                        {isResponseDiffCollapsible ? (
                          <button
                            type="button"
                            onClick={() => setShowFullResponseDiff(v => !v)}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/60 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                          >
                            {showFullResponseDiff ? "Collapse response" : "Show full response"}
                          </button>
                        ) : null}
                        {diffRemovedCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setShowRemovedDiffLines(v => !v)}
                            aria-pressed={showRemovedDiffLines}
                            className={clsx(
                              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70",
                              showRemovedDiffLines
                                ? "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-50 shadow-[0_0_0_1px_rgba(217,70,239,0.15)] hover:bg-fuchsia-500/25"
                                : "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/18"
                            )}
                          >
                            <span>
                              {showRemovedDiffLines ? "Hide removed lines" : "Show removed lines"}
                            </span>
                            <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-white/85">
                              {diffRemovedCount}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {isToolDrivenAttempt ? (
                      <div className="mt-4 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-3 text-[11px] leading-relaxed text-white/40">
                        This section only compares the user-facing assistant reply. Review the tool
                        impact summary above if the main outcome happened through a tool call.
                      </div>
                    ) : null}
                    <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                        Reply summary
                      </div>
                      <div className="mt-1 text-sm font-medium text-white">
                        {responseDiffSummary}
                      </div>
                    </div>
                    {isResponseDiffCollapsible && !showFullResponseDiff ? (
                      <div className="mt-4 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-3 text-[11px] leading-relaxed text-white/40">
                        Showing a shortened preview so long responses do not take over the review.
                        {hiddenResponseDiffLineCount > 0
                          ? ` Expand to inspect ${hiddenResponseDiffLineCount} more diff line${hiddenResponseDiffLineCount === 1 ? "" : "s"}.`
                          : " Expand to inspect the full response body."}
                      </div>
                    ) : null}
                    <div className="mt-4 grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <div
                        className={clsx(
                          "flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#0a0a0c]",
                          isResponseDiffCollapsible && !showFullResponseDiff
                            ? "min-h-[280px]"
                            : "min-h-[420px]"
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-3">
                          <span className="text-[11px] font-semibold text-white/40">Baseline</span>
                          <span className="text-[10px] text-white/30">{baselineModel}</span>
                        </div>
                        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 font-mono text-[13px] leading-[1.75] text-white/60 whitespace-pre-wrap break-words">
                          {baselineResponseDisplay}
                        </div>
                      </div>
                      <div
                        className={clsx(
                          "flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#0a0a0c]",
                          isResponseDiffCollapsible && !showFullResponseDiff
                            ? "min-h-[280px]"
                            : "min-h-[420px]"
                        )}
                      >
                        <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-3">
                          <span className="text-[11px] font-semibold text-white/40">Replay</span>
                          <span className="text-[10px] text-white/30">{candidateModel}</span>
                        </div>
                        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-0 font-mono text-[13px] leading-[1.75] whitespace-pre-wrap break-words">
                          {!candidateResponse ? (
                            <div className="p-5 text-white/30">{candidateResponseDisplay}</div>
                          ) : responseDiffLines.length === 0 ? (
                            <div className="p-5 text-white/60">{candidateResponseDisplay}</div>
                          ) : (
                            <div className="flex flex-col py-3 text-white/60">
                              {visibleResponseDiffLines.map((line, idx) => {
                                const isAdded = line.startsWith("+");
                                const isRemoved = line.startsWith("-");
                                const content = line.substring(2);
                                return (
                                  <div
                                    key={idx}
                                    className={clsx(
                                      "block w-full px-4 py-0.5",
                                      isAdded &&
                                        "border-l-2 border-emerald-500/50 bg-emerald-500/10 font-medium text-emerald-200",
                                      isRemoved &&
                                        "border-l-2 border-rose-500/50 bg-rose-500/10 text-rose-200 line-through decoration-rose-300/70",
                                      !isAdded && !isRemoved && "pl-[18px]"
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
                  </section>

                  {hasAdditionalDetails ? (
                    <div ref={detailsSectionRef} className="grid gap-5">
                      <section className="py-6 border-b border-white/5">
                        <div>
                          <div className="text-xs font-medium text-white/40">
                            Additional details
                          </div>
                          <h3 className="mt-2 text-lg font-semibold text-white">
                            Extra review context
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-white/60">
                            Open these only when you need more setup context, tool evidence, or
                            warnings.
                          </p>
                        </div>
                        <div className="mt-4 space-y-3">
                          {attentionItems.length > 0 ? (
                            <details className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-3">
                              <summary className="cursor-pointer list-none text-sm font-medium text-white/90 [&::-webkit-details-marker]:hidden">
                                Run warnings
                                <span className="ml-2 text-[11px] font-normal text-white/30">
                                  {attentionItems.length} item
                                  {attentionItems.length === 1 ? "" : "s"}
                                </span>
                              </summary>
                              <div className="mt-3 space-y-2">
                                {attentionItems.map(item => (
                                  <div
                                    key={item.key}
                                    className={clsx(
                                      "rounded-lg border px-3 py-3",
                                      riskToneClass(item.tone)
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-sm font-medium text-white/80">
                                        {item.label}
                                      </span>
                                      <span
                                        className={clsx(
                                          "text-xs font-semibold",
                                          item.tone === "danger"
                                            ? "text-rose-400"
                                            : item.tone === "warning"
                                              ? "text-amber-400"
                                              : "text-emerald-400"
                                        )}
                                      >
                                        {item.tone === "danger"
                                          ? "Review"
                                          : item.tone === "warning"
                                            ? "Watch"
                                            : "Stable"}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-[11px] leading-relaxed text-white/60">
                                      {item.detail}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : null}

                          {hasToolBehaviorDetails ? (
                            <div
                              ref={toolBehaviorSectionRef}
                              className={clsx("rounded-r-lg px-4 py-4", toolBehaviorToneClass)}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                                    <div className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
                                    Tool execution details
                                  </div>
                                  <p className="mt-2 text-[11px] leading-relaxed text-white/60">
                                    {toolBehaviorSummary}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowToolBehaviorDetails(v => !v)}
                                  className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                                >
                                  {showToolBehaviorDetails ? "Hide details" : "Show details"}
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                                <span className="inline-flex rounded-md bg-white/5 px-2.5 py-1">
                                  Policy{" "}
                                  {toolPolicyEnabled
                                    ? policyRows.length > 0
                                      ? "needs review"
                                      : "aligned"
                                    : "not enabled"}
                                </span>
                                <span className="inline-flex rounded-md bg-white/5 px-2.5 py-1">
                                  Calls {toolTotalCalls}
                                </span>
                                <span className="inline-flex rounded-md bg-white/5 px-2.5 py-1">
                                  Executed {toolExecutedCount}
                                </span>
                                <span className="inline-flex rounded-md bg-white/5 px-2.5 py-1">
                                  Recorded {toolRecordedCount}
                                </span>
                                <span className="inline-flex rounded-md bg-white/5 px-2.5 py-1">
                                  Results {toolResultCount}
                                </span>
                                {toolFailedCount > 0 ? (
                                  <span className="inline-flex rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-rose-200">
                                    Failed {toolFailedCount}
                                  </span>
                                ) : null}
                              </div>
                              {showToolBehaviorDetails ? (
                                <div className="mt-4 space-y-4">
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                                    <span>
                                      Loop {toolLoopStatus}
                                      {toolLoopRounds > 0 ? ` (${toolLoopRounds} rounds)` : ""}
                                    </span>
                                    {toolSimulatedCount > 0 ? (
                                      <span>Simulated {toolSimulatedCount}</span>
                                    ) : null}
                                    {toolSkippedCount > 0 ? (
                                      <span>Skipped {toolSkippedCount}</span>
                                    ) : null}
                                  </div>
                                  {policyRows.length > 0 ? (
                                    <div className="space-y-2">
                                      {policyRows.map(row => (
                                        <div
                                          key={row.key}
                                          className="rounded-xl bg-black/25 px-3 py-3 ring-1 ring-white/5"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-rose-100">
                                              {row.label}
                                            </span>
                                            {row.severity ? (
                                              <span className="text-[10px] font-semibold text-rose-300">
                                                {row.severity}
                                              </span>
                                            ) : null}
                                          </div>
                                          {row.message ? (
                                            <p className="mt-1 text-[11px] leading-relaxed text-rose-100/75">
                                              {row.message}
                                            </p>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {toolExpectationRows.length > 0 ? (
                                    <div className="space-y-2">
                                      <div className="text-[11px] font-semibold text-white/75">
                                        Tool setup
                                      </div>
                                      {toolExpectationRows.map(row => {
                                        const label =
                                          row.toolType === "action"
                                            ? "Payload fields"
                                            : "Returned fields";
                                        const matchedSummary =
                                          row.configuredFields.length > 0
                                            ? `Matched ${label.toLowerCase()} ${row.matchedFields.length}/${row.configuredFields.length}`
                                            : "No expectation fields configured";
                                        return (
                                          <div
                                            key={`${row.toolType}:${row.name}`}
                                            className="rounded-xl bg-black/25 px-3 py-3 ring-1 ring-white/5"
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="text-xs font-semibold text-white/90">
                                                {row.name}
                                              </span>
                                              <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-300/80">
                                                {row.toolType === "action" ? "Action" : "Retrieval"}
                                              </span>
                                            </div>
                                            <p className="mt-1 text-[11px] leading-relaxed text-white/70">
                                              {matchedSummary}
                                            </p>
                                            {row.baselineSampleSummary ? (
                                              <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-emerald-100/90 whitespace-pre-wrap break-words">
                                                <div className="mb-1 font-bold uppercase tracking-wider text-emerald-300/80">
                                                  Baseline sample
                                                </div>
                                                {row.baselineSampleSummary}
                                              </div>
                                            ) : null}
                                            {row.missingFields.length > 0 ? (
                                              <div className="mt-2 text-[11px] text-amber-200/90">
                                                Missing: {row.missingFields.join(", ")}
                                              </div>
                                            ) : null}
                                            {row.matchedFields.length > 0 ? (
                                              <div className="mt-1 text-[11px] text-emerald-200/90">
                                                Matched: {row.matchedFields.join(", ")}
                                              </div>
                                            ) : null}
                                            {row.resultGuide ? (
                                              <div className="mt-2 text-[10px] leading-relaxed text-white/45">
                                                <span className="font-semibold text-white/55">
                                                  Extra notes:
                                                </span>{" "}
                                                {row.resultGuide}
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                  {gateToolTimelineRows.length > 0 ? (
                                    <div className="border-t border-white/5 pt-4">
                                      <ToolTimelinePanel
                                        rows={gateToolTimelineRows}
                                        title="Tool timeline"
                                        subtitle="Compare recorded and replayed tool activity."
                                        icon={Wrench}
                                        variant="compact"
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {hasConfigurationChanges ? (
                            <details className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-3">
                              <summary className="cursor-pointer list-none text-sm font-medium text-white/90 [&::-webkit-details-marker]:hidden">
                                Extra request fields
                                <span className="ml-2 text-[11px] font-normal text-white/30">
                                  {replayOverrideCount > 0
                                    ? `${replayOverrideCount} shared field${replayOverrideCount === 1 ? "" : "s"}`
                                    : "No shared fields"}
                                  {replayPerLogOverrideCount > 0
                                    ? ` · ${replayPerLogOverrideCount} input${replayPerLogOverrideCount === 1 ? "" : "s"} with custom values`
                                    : ""}
                                </span>
                              </summary>
                              <div className="mt-3">
                                <ReleaseGateReplayRequestMetaPanel
                                  meta={replayRequestMeta as any}
                                />
                              </div>
                            </details>
                          ) : null}

                          {hasToolContextDetails ? (
                            <details className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-4 py-3">
                              <summary className="cursor-pointer list-none text-sm font-medium text-white/90 [&::-webkit-details-marker]:hidden">
                                Extra context
                                <span className="ml-2 text-[11px] font-normal text-white/30">
                                  {toolContextSummary}
                                </span>
                              </summary>
                              <div className="mt-3 space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
                                    <div className="text-[11px] font-medium text-white/30">
                                      Mode
                                    </div>
                                    <div className="mt-1 text-sm text-white/90">
                                      {toolContextModeValue === "inject"
                                        ? "Add extra context"
                                        : "Use the recorded request only"}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
                                    <div className="text-[11px] font-medium text-white/30">
                                      Scope
                                    </div>
                                    <div className="mt-1 text-sm text-white/90">
                                      {toolContextScopeLabel}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
                                    <div className="text-[11px] font-medium text-white/30">
                                      Inputs with custom guidance
                                    </div>
                                    <div className="mt-1 text-sm text-white/90">
                                      {toolContextCustomEntries.length}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
                                    <div className="text-[11px] font-medium text-white/30">
                                      Shared fallback text
                                    </div>
                                    <div className="mt-1 text-sm text-white/90">
                                      {toolContextGlobalText ? "Present" : "Not set"}
                                    </div>
                                  </div>
                                </div>
                                {toolContextGlobalText ? (
                                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
                                    <div className="text-[11px] font-medium text-white/30">
                                      Shared guidance preview
                                    </div>
                                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/60 custom-scrollbar">
                                      {toolContextGlobalText}
                                    </pre>
                                  </div>
                                ) : null}
                                {toolContextCustomEntries.length > 0 ? (
                                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
                                    <div className="text-[11px] font-medium text-white/30">
                                      Per-input guidance
                                    </div>
                                    <div className="mt-3 space-y-2">
                                      {toolContextCustomEntries.map(([sid, value]) => (
                                        <details
                                          key={sid}
                                          className="rounded-lg border border-white/5 bg-black/20 px-3 py-2"
                                        >
                                          <summary className="cursor-pointer list-none text-[11px] font-medium text-white/80 [&::-webkit-details-marker]:hidden">
                                            Input {sid}
                                          </summary>
                                          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/40 custom-scrollbar">
                                            {String(value)}
                                          </pre>
                                        </details>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {detailMainTab === "debug" && (
                <div className="mx-auto flex w-full max-w-[1200px] min-h-[calc(90vh-220px)] flex-col gap-5">
                  <section className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="text-xs font-medium text-white/40">
                          Support and diagnostics
                        </div>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          Diagnostics payload
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-white/60">
                          Use this only when the Review tab is not enough. This view exposes the raw
                          replay payload, provider metadata, extraction details, and tool evidence
                          so you can diagnose capture issues or provider-specific behavior.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                          Provider {candidateProvider || "Unknown"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                          {responseDataKeys.length > 0
                            ? `${responseDataKeys.length} payload keys`
                            : "No payload keys"}
                        </span>
                      </div>
                    </div>
                  </section>

                  <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-10">
                    <div className="flex min-h-[400px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#0a0a0c] xl:col-span-7">
                      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-5 py-3">
                        <span className="text-[11px] font-medium text-white/40">JSON payload</span>
                      </div>
                      <pre className="custom-scrollbar min-h-0 flex-1 overflow-auto p-6 font-mono text-[12px] leading-[1.7] text-white/60 whitespace-pre-wrap break-words">
                        {candidatePayloadPreview}
                      </pre>
                    </div>

                    <div className="space-y-3 xl:col-span-3">
                      <div className="rounded-2xl bg-white/[0.02] px-5 py-4 ring-1 ring-white/6">
                        <div className="text-[11px] font-medium text-white/40">Provider</div>
                        <div className="mt-2 text-sm font-medium text-white/90 break-words">
                          {candidateProvider}
                        </div>
                        <div className="mt-1 text-xs text-white/40">{candidateModel}</div>
                      </div>
                      <div className="rounded-2xl bg-white/[0.02] px-5 py-4 ring-1 ring-white/6">
                        <div className="text-[11px] font-medium text-white/40">Payload health</div>
                        <div className="mt-2 text-sm font-medium text-white/90 break-words">
                          {hasProviderError
                            ? "Provider warning attached"
                            : "Structured payload captured"}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          {responseDataKeys.length > 0
                            ? `${responseDataKeys.length} keys captured`
                            : "No payload keys"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white/[0.02] px-5 py-4 ring-1 ring-white/6">
                        <div className="text-[11px] font-medium text-white/40">Tool evidence</div>
                        <div className="mt-2 text-sm font-medium text-white/90 break-words">
                          {toolTotalCalls > 0
                            ? `${toolTotalCalls} call${toolTotalCalls === 1 ? "" : "s"} detected`
                            : "No tool calls detected"}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          Executed {toolExecutedCount} / Recorded {toolRecordedCount} / Simulated{" "}
                          {toolSimulatedCount} / Skipped {toolSkippedCount}
                        </div>
                        <div className="mt-1 text-xs text-white/30">
                          Loop {toolLoopStatus}
                          {toolLoopRounds > 0 ? ` (${toolLoopRounds} rounds)` : ""}
                        </div>
                        <div className="mt-1 text-xs text-white/30">
                          Tool results captured {toolResultCount}
                        </div>
                        {flattenedToolLoopRows.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {flattenedToolLoopRows.slice(0, 3).map((row, idx) => (
                              <div
                                key={`${row.round}-${row.name}-${idx}`}
                                className="rounded-xl bg-black/20 px-3 py-2 ring-1 ring-white/5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-medium text-white/80">
                                    Round {row.round || 1} · {row.name}
                                    {row.callId ? (
                                      <span className="ml-1 font-mono text-[10px] font-normal text-white/30">
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
                                          : "text-white/40"
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
                                  <p
                                    className="mt-1 text-[10px] text-amber-200/90"
                                    title="call_id mismatch"
                                  >
                                    Weak match: baseline result matched by tool name order
                                    (cross-provider or missing id).
                                  </p>
                                ) : null}
                                {row.mode ? (
                                  <p className="mt-1 text-[10px] text-white/30">
                                    Mode: {row.mode}
                                  </p>
                                ) : null}
                                {row.argumentsPreview ? (
                                  <p className="mt-1 line-clamp-2 text-[10px] text-white/30">
                                    {row.argumentsPreview}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl bg-white/[0.02] px-5 py-4 ring-1 ring-white/6">
                        <div className="text-[11px] font-medium text-white/40">Extract path</div>
                        <div className="mt-2 text-sm font-medium text-white/90 break-words">
                          {String(
                            (candidateSnapshot as any)?.response_extract_path ?? "Not captured"
                          )}
                        </div>
                        <div className="mt-1 text-xs text-white/40 break-words">
                          {String(
                            (candidateSnapshot as any)?.response_extract_reason ??
                              "No extraction warning"
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white/[0.02] px-5 py-4 ring-1 ring-white/6">
                        <div className="text-[11px] font-medium text-white/40">Payload keys</div>
                        <div className="mt-2 text-sm font-medium text-white/90 break-words">
                          {responseDataKeys.length > 0
                            ? responseDataKeys.slice(0, 10).join(", ")
                            : "None captured"}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          {providerErrorPreview
                            ? "Provider preview included"
                            : "Structured response payload"}
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
