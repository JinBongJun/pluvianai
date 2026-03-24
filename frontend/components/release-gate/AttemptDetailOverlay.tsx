"use client";

import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronLeft, ChevronRight, ShieldCheck, ShieldX, Wrench } from "lucide-react";
import { sanitizePayloadForPreview } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGatePageContent";
import {
  computeSimpleLineDiff,
  normalizeViolationRuleId,
  toHumanRuleLabel,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";
import { formatDurationMs, percentFromRate } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateViewUtils";
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import type { LiveViewToolTimelineRow } from "@/lib/api/live-view";

export type AttemptDetailMainTab = "summary" | "comparison" | "debug";

export function AttemptDetailOverlay({
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
  const [attemptMenuOpen, setAttemptMenuOpen] = useState(false);
  const [userInputExpanded, setUserInputExpanded] = useState(false);
  const [showRemovedDiffLines, setShowRemovedDiffLines] = useState(false);
  const [navIndex, setNavIndex] = useState(0);

  const attemptCount = Array.isArray(attempts) ? attempts.length : 0;
  const maxNav = Math.max(0, attemptCount - 1);
  const safeInitial = Math.min(Math.max(0, initialAttemptIndex), maxNav);

  const [failedOnly, setFailedOnly] = useState(false);

  useEffect(() => {
    if (open) {
      setDetailMainTab("summary");
      setAttemptMenuOpen(false);
      setUserInputExpanded(false);
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
  type WhyDecisionItem = {
    key: string;
    label: string;
    detail: string;
    severity: DecisionSeverity;
    source: "policy" | "gate" | "eval" | "summary";
  };
  const whyDecisionItems = useMemo<WhyDecisionItem[]>(() => {
    if (pass) {
      const passItems: WhyDecisionItem[] = [];
      passItems.push({
        key: "summary-pass",
        label: "No blocking regressions",
        detail: "This attempt did not trigger any blocking gate or policy conditions.",
        severity: "low",
        source: "summary",
      });
      if (policyRows.length === 0) {
        passItems.push({
          key: "policy-clean",
          label: "Policy remained clean",
          detail: "No policy violations were detected in the replayed attempt.",
          severity: "low",
          source: "policy",
        });
      }
      if (evalTotalCount > 0) {
        passItems.push({
          key: "eval-coverage",
          label: `${evalPassCount}/${evalTotalCount} eval checks passed`,
          detail:
            failedSignals.length > 0
              ? `${failedSignals.length} signal(s) still need review.`
              : "All captured user-facing eval checks passed for this attempt.",
          severity: failedSignals.length > 0 ? "medium" : "low",
          source: "eval",
        });
      }
      passItems.push({
        key: "evidence-quality",
        label: `Evidence quality: ${gateConfidence.label}`,
        detail: gateConfidence.detail,
        severity:
          gateConfidence.label === "High"
            ? "low"
            : gateConfidence.label === "Medium"
              ? "medium"
              : "high",
        source: "summary",
      });
      return passItems.slice(0, 3);
    }

    const items: WhyDecisionItem[] = [];
    policyRows.forEach((row, idx) => {
      items.push({
        key: `policy-${row.key}-${idx}`,
        label: row.label,
        detail: row.message || "Policy violation detected.",
        severity: normalizeSeverity(row.severity, "high"),
        source: "policy",
      });
    });
    failedGates.forEach(gate => {
      items.push({
        key: `gate-${gate.id}`,
        label: gate.label,
        detail: gate.reason || `${gate.label} failed.`,
        severity: gate.id === "tool_integrity" ? "critical" : "high",
        source: "gate",
      });
    });
    failedSignals.forEach(row => {
      const signalDetail =
        signalsDetailsRaw && typeof signalsDetailsRaw === "object"
          ? formatSignalWhy(row.id, (signalsDetailsRaw as any)?.[row.id])
          : "";
      items.push({
        key: `eval-${row.id}`,
        label: row.label,
        detail: signalDetail || "This eval check failed without additional evidence text.",
        severity: "medium",
        source: "eval",
      });
    });
    if (items.length === 0) {
      items.push({
        key: "summary-fallback",
        label: "Blocking issue detected",
        detail: decisionHeadline.replace(/^Reason:\s*/i, ""),
        severity: "high",
        source: "summary",
      });
    }
    return items
      .filter(item => item.detail.trim())
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 3);
  }, [
    pass,
    policyRows,
    evalTotalCount,
    evalPassCount,
    failedSignals,
    gateConfidence,
    failedGates,
    signalsDetailsRaw,
    decisionHeadline,
  ]);
  const whyDecisionToneClass = (severity: DecisionSeverity): string => {
    if (severity === "critical" || severity === "high") {
      return "border-rose-500/20 bg-rose-500/[0.05]";
    }
    if (severity === "medium") {
      return "border-amber-500/20 bg-amber-500/[0.05]";
    }
    return "border-emerald-500/20 bg-emerald-500/[0.05]";
  };
  const whyDecisionBadgeClass = (severity: DecisionSeverity): string => {
    if (severity === "critical" || severity === "high") {
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    }
    if (severity === "medium") {
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    }
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  };
  const comparisonPrimaryChanges = useMemo(() => {
    const items: string[] = [];
    if (candidateLineCount > baselineLineCount) {
      items.push(`Candidate response is longer by ${candidateLineCount - baselineLineCount} line${candidateLineCount - baselineLineCount === 1 ? "" : "s"}.`);
    } else if (baselineLineCount > candidateLineCount) {
      items.push(`Candidate response is shorter by ${baselineLineCount - candidateLineCount} line${baselineLineCount - candidateLineCount === 1 ? "" : "s"}.`);
    }
    if (diffAddedCount > 0) {
      items.push(`${diffAddedCount} added or modified line${diffAddedCount === 1 ? "" : "s"} detected on the candidate side.`);
    }
    if (diffRemovedCount > 0) {
      items.push(`${diffRemovedCount} baseline line${diffRemovedCount === 1 ? "" : "s"} are missing from the candidate output.`);
    }
    if (sequenceEdits > 0) {
      items.push(`Behavior diff reports ${sequenceEdits} sequence edit${sequenceEdits === 1 ? "" : "s"}.`);
    }
    if (items.length === 0) {
      items.push("No meaningful response shape changes were detected in this attempt.");
    }
    return items.slice(0, 3);
  }, [candidateLineCount, baselineLineCount, diffAddedCount, diffRemovedCount, sequenceEdits]);
  const comparisonImpactItems = useMemo(() => {
    const items: string[] = [];
    if (policyRows.length > 0) {
      items.push(`${policyRows.length} policy violation${policyRows.length === 1 ? "" : "s"} are attached to this attempt.`);
    } else {
      items.push("No policy regressions were attached to this attempt.");
    }
    if (toolDivergencePct > 0) {
      items.push(`Tool divergence is ${toolDivergenceLabel}, so tool behavior changed beyond a pure wording edit.`);
    } else {
      items.push("Tool behavior stayed aligned with the baseline for this attempt.");
    }
    if (hasProviderError) {
      items.push("Provider warnings were captured, so inspect the debug trace before trusting subtle output differences.");
    } else if (diffConfidenceLabel === "High") {
      items.push("Both response previews were captured, so the line diff is safe to review directly.");
    } else {
      items.push("Response capture is partial, so treat the diff as directional rather than complete.");
    }
    return items.slice(0, 3);
  }, [
    policyRows.length,
    toolDivergencePct,
    toolDivergenceLabel,
    hasProviderError,
    diffConfidenceLabel,
  ]);
  const runContextItems = useMemo(() => {
    const items: Array<{ label: string; value: string; detail?: string }> = [
      {
        label: "Models",
        value: `${baselineModel} → ${candidateModel}`,
        detail: candidateProvider || undefined,
      },
      {
        label: "Latency",
        value: replayLatencyLabel,
        detail: attempt?.trace_id ? `Trace ${String(attempt.trace_id)}` : "Trace not captured",
      },
      {
        label: "Eval Coverage",
        value: evalTotalCount > 0 ? `${evalPassCount}/${evalTotalCount}` : "—",
        detail:
          failedSignals.length > 0
            ? `${failedSignals.length} failing signal${failedSignals.length === 1 ? "" : "s"}`
            : "No failing eval signals",
      },
    ];
    return items;
  }, [
    baselineModel,
    candidateModel,
    candidateProvider,
    replayLatencyLabel,
    attempt,
    evalTotalCount,
    evalPassCount,
    failedSignals.length,
  ]);
  const riskItems = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      detail: string;
      tone: "neutral" | "warning" | "danger";
    }> = [];
    items.push({
      key: "policy",
      label: "Policy",
      detail:
        policyRows.length > 0
          ? `${policyRows.length} violation${policyRows.length === 1 ? "" : "s"} require review.`
          : "No policy violations were attached to this attempt.",
      tone: policyRows.length > 0 ? "danger" : "neutral",
    });
    items.push({
      key: "tool-divergence",
      label: "Tool Divergence",
      detail:
        sequenceEdits > 0 || toolDivergencePct > 0
          ? `${sequenceEdits} sequence edit${sequenceEdits === 1 ? "" : "s"} and ${toolDivergenceLabel} tool divergence.`
          : "Tool behavior stayed aligned with the baseline.",
      tone: sequenceEdits > 0 || toolDivergencePct > 0 ? "warning" : "neutral",
    });
    items.push({
      key: "evidence",
      label: "Evidence Quality",
      detail: gateConfidence.detail,
      tone:
        gateConfidence.label === "High"
          ? "neutral"
          : gateConfidence.label === "Medium"
            ? "warning"
            : "danger",
    });
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

  if (!open) return null;

  const inputPreview = candidateInput || baselineInput;
  const detailTabs = [
    { id: "summary" as const, label: "Summary" },
    { id: "comparison" as const, label: "Comparison" },
    { id: "debug" as const, label: "Debug Trace" },
  ];
  const decisionLabel = pass ? "Gate passed" : "Gate failed";
  const attemptLabel = `Attempt ${navIndex + 1}${attemptCount > 1 ? ` of ${attemptCount}` : ""}`;
  const headerMeta = [
    `Input ${inputIndex + 1}`,
    attemptLabel,
    replayLatencyLabel,
    `${baselineModel} → ${candidateModel}`,
  ];

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md sm:p-6">
      <div className="flex h-[90vh] w-full max-w-[1680px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0f14] shadow-2xl">
        <div className="flex shrink-0 flex-col gap-4 border-b border-white/8 px-6 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-500">Attempt review</div>
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
              <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
                {decisionHeadline.replace(/^Reason:\s*/i, "")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {headerMeta.map(item => (
                  <span
                    key={item}
                    className="inline-flex rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-slate-400"
                  >
                    {item}
                  </span>
                ))}
              </div>
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
                          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
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
                className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
              >
                Close
              </button>
            </div>
          </div>

          {attemptCount > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-slate-200">{attemptLabel}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {failedOnly ? "Showing failed attempts only." : "Browsing all attempts for this input."}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNavIndex(v => Math.max(0, v - 1))}
                  disabled={navIndex <= 0}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous attempt"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAttemptMenuOpen(!attemptMenuOpen)}
                    className="flex min-w-[180px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                  >
                    <span>{attemptLabel}</span>
                    <ChevronDown
                      className={clsx(
                        "h-4 w-4 text-slate-400 transition-transform",
                        attemptMenuOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {attemptMenuOpen && (
                    <div className="absolute left-0 top-full z-[12000] mt-2 w-72 rounded-xl border border-white/10 bg-[#1e2028] p-2 shadow-2xl">
                      <div className="mb-2 flex items-center justify-between px-2 pt-1">
                        <span className="text-[11px] font-semibold text-slate-400">Attempts</span>
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
                              : "border-white/10 text-slate-400 hover:text-slate-200"
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
                                  : "text-slate-300 hover:bg-white/5"
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
                                <span className="text-[10px] text-slate-500">Current</span>
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
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
                      "flex flex-col gap-5 rounded-3xl border px-6 py-6",
                      pass
                        ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                        : "border-rose-500/25 bg-rose-500/[0.04]"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 max-w-4xl space-y-3">
                        <div className="text-[11px] font-medium text-slate-400">
                          Key metrics and evidence sources for this attempt.
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                          {decisionSourceLabels.map(label => (
                            <span
                              key={label}
                              className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="min-w-[240px] rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
                        <div className="text-[11px] font-medium text-slate-400">
                          Confidence
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={clsx(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                              gateConfidence.toneClass
                            )}
                          >
                            {gateConfidence.label}
                          </span>
                          <span className="text-xs text-slate-400">Trace coverage</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-300">{gateConfidence.detail}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                        <div className="text-[11px] font-medium text-slate-400">Eval checks</div>
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
                        <div className="text-[11px] font-medium text-slate-400">Policy</div>
                        <div className="mt-2 text-lg font-semibold text-white tabular-nums">
                          {policyRows.length === 0 ? "Clean" : `${policyRows.length} found`}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {policyRows.length === 0 ? "No blocking issues" : "Review policy details"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                        <div className="text-[11px] font-medium text-slate-400">Replay</div>
                        <div className="mt-2 text-lg font-semibold text-white tabular-nums">
                          {replayLatencyLabel}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {baselineModel} → {candidateModel}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
                        <div className="text-[11px] font-medium text-slate-400">Tool divergence</div>
                        <div className="mt-2 text-lg font-semibold text-white tabular-nums">
                          {sequenceEdits} edit{sequenceEdits === 1 ? "" : "s"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{toolDivergenceLabel} divergence</div>
                      </div>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-3">
                      {whyDecisionItems.map(item => (
                        <div
                          key={item.key}
                          className={clsx("rounded-2xl border p-4", whyDecisionToneClass(item.severity))}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-100">{item.label}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{item.source}</div>
                            </div>
                            <span
                              className={clsx(
                                "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                whyDecisionBadgeClass(item.severity)
                              )}
                            >
                              {item.severity}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-400">Tool evidence</span>
                        <span
                          className={clsx(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
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

                      <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            User Input
                          </div>
                          <button
                            type="button"
                            onClick={() => setUserInputExpanded(v => !v)}
                            className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/80 transition-colors hover:text-fuchsia-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
                          >
                            {userInputExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                        <p
                          className={clsx(
                            "mt-3 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap break-words",
                            !userInputExpanded && "line-clamp-5"
                          )}
                        >
                          {inputPreview}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Run Context
                        </div>
                        <div className="mt-3 grid gap-3">
                          {runContextItems.map(item => (
                            <div
                              key={item.label}
                              className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3"
                            >
                              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                {item.label}
                              </div>
                              <div className="mt-1 text-sm font-medium text-slate-100 break-words">
                                {item.value}
                              </div>
                              {item.detail ? (
                                <div className="mt-1 text-xs text-slate-400 break-words">{item.detail}</div>
                              ) : null}
                            </div>
                          ))}
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
                          Risks
                        </h3>
                        <div className="space-y-3">
                          {riskItems.map(item => (
                            <div
                              key={item.key}
                              className={clsx(
                                "rounded-2xl border p-4",
                                riskToneClass(item.tone)
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-slate-200">{item.label}</span>
                                <span
                                  className={clsx(
                                    "text-[10px] font-bold uppercase tracking-wider",
                                    item.tone === "danger"
                                      ? "text-rose-300"
                                      : item.tone === "warning"
                                        ? "text-amber-200"
                                        : "text-emerald-300"
                                  )}
                                >
                                  {item.tone === "danger"
                                    ? "Review"
                                    : item.tone === "warning"
                                      ? "Watch"
                                      : "Stable"}
                                </span>
                              </div>
                              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                                {item.detail}
                              </p>
                            </div>
                          ))}
                          {policyRows.length > 0 ? (
                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
                              <div className="mb-3 flex items-center justify-between gap-4">
                                <span className="text-sm font-medium text-rose-200">Policy Details</span>
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
                          ) : null}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              )}

              {detailMainTab === "comparison" && (
                <div className="mx-auto flex w-full max-w-[1200px] min-h-[calc(90vh-220px)] flex-col gap-4">
                  <section className="rounded-3xl border border-white/8 bg-white/[0.02] px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="text-[11px] font-medium text-slate-400">Diff review</div>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          Review what changed before checking the raw trace
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          Start with the summary cards below, then inspect the side-by-side response diff. Use
                          Debug Trace only when you need provider payload details or capture diagnostics.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                          Diff confidence {diffConfidenceLabel}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                          {baselineLineCount} {"->"} {candidateLineCount} lines
                        </span>
                      </div>
                    </div>
                  </section>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-4">
                      <div className="text-[11px] font-medium text-slate-400">What changed</div>
                      <div className="mt-3 space-y-2">
                        {comparisonPrimaryChanges.map(item => (
                          <div
                            key={item}
                            className="rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-sm leading-relaxed text-slate-200"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-4">
                      <div className="text-[11px] font-medium text-slate-400">What it means</div>
                      <div className="mt-3 space-y-2">
                        {comparisonImpactItems.map(item => (
                          <div
                            key={item}
                            className="rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-sm leading-relaxed text-slate-200"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[11px] font-medium text-slate-400">Baseline</div>
                      <div className="mt-1.5 text-sm font-medium text-slate-100 break-words">{baselineModel}</div>
                      <div className="mt-1 text-xs text-slate-400 tabular-nums">{baselineLineCount} lines</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[11px] font-medium text-slate-400">Candidate</div>
                      <div className="mt-1.5 text-sm font-medium text-slate-100 break-words">{candidateModel}</div>
                      <div className="mt-1 text-xs text-slate-400 tabular-nums">{candidateLineCount} lines</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[11px] font-medium text-slate-400">Added or changed</div>
                      <div className="mt-1.5 text-sm font-medium text-emerald-300 tabular-nums">+{diffAddedCount}</div>
                      <div className="mt-1 text-xs text-slate-400">Highlighted on the candidate side.</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="text-[11px] font-medium text-slate-400">Removed</div>
                      <div className="mt-1.5 text-sm font-medium text-rose-300 tabular-nums">-{diffRemovedCount}</div>
                      <div className="mt-1 text-xs text-slate-400">Track lines missing from the candidate output.</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-semibold text-slate-300">
                      Response diff
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>Green marks added or modified candidate output.</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        Diff confidence {diffConfidenceLabel}
                      </span>
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
                          <span>{showRemovedDiffLines ? "Hide removed lines" : "Show removed lines"}</span>
                          <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-white/85">
                            {diffRemovedCount}
                          </span>
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
                  <section className="rounded-3xl border border-white/8 bg-white/[0.02] px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="text-[11px] font-medium text-slate-400">Support and diagnostics</div>
                        <h3 className="mt-2 text-lg font-semibold text-white">Debug trace payload</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          Use this only when Summary and Comparison are not enough. This view exposes the raw replay
                          payload, provider metadata, extraction details, and tool evidence so you can diagnose capture
                          issues or provider-specific behavior.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                          Provider {candidateProvider || "Unknown"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                          {responseDataKeys.length > 0 ? `${responseDataKeys.length} payload keys` : "No payload keys"}
                        </span>
                      </div>
                    </div>
                  </section>

                  <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-10">
                    <div className="flex min-h-[400px] flex-col overflow-hidden rounded-3xl border border-white/8 bg-[#0a0a0c] xl:col-span-7">
                      <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-5 py-3">
                        <span className="text-[11px] font-medium text-slate-400">JSON payload</span>
                      </div>
                      <pre className="custom-scrollbar min-h-0 flex-1 overflow-auto p-6 font-mono text-[12px] leading-[1.7] text-slate-300 whitespace-pre-wrap break-words">
                        {candidatePayloadPreview}
                      </pre>
                    </div>

                    <div className="space-y-3 xl:col-span-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[11px] font-medium text-slate-400">Provider</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">{candidateProvider}</div>
                        <div className="mt-1 text-xs text-slate-400">{candidateModel}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[11px] font-medium text-slate-400">Payload health</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">
                          {hasProviderError ? "Provider warning attached" : "Structured payload captured"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {responseDataKeys.length > 0 ? `${responseDataKeys.length} keys captured` : "No payload keys"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[11px] font-medium text-slate-400">Tool evidence</div>
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
                        <div className="text-[11px] font-medium text-slate-400">Extract path</div>
                        <div className="mt-2 text-sm font-medium text-slate-100 break-words">
                          {String((candidateSnapshot as any)?.response_extract_path ?? "Not captured")}
                        </div>
                        <div className="mt-1 text-xs text-slate-400 break-words">
                          {String((candidateSnapshot as any)?.response_extract_reason ?? "No extraction warning")}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4">
                        <div className="text-[11px] font-medium text-slate-400">Payload keys</div>
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