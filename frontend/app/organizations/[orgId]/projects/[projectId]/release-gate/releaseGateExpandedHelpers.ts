/**
 * Pure helpers and labels for Release Gate expanded view (keeps ReleaseGateExpandedView.tsx smaller).
 */

export type GateTab = "validate" | "history";
export type ThresholdPreset = "strict" | "default" | "lenient" | "custom";
export type ResultCaseFilter = "all" | "failed" | "passed";
export type LogsStatusFilter = "all" | "failed" | "passed";

export type FixHint = {
  key: string;
  label: string;
  count: number;
  severity?: string;
  hint: string;
  sample?: string;
};

export type VisibleResultCase = {
  run: any;
  caseIndex: number;
};

export const EVAL_CHECK_LABELS: Record<string, string> = {
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

export const RULE_FIX_HINTS: Record<string, string> = {
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

export function computeSimpleLineDiff(a: string, b: string, maxLines = 200): string[] {
  const aLines = a.split("\n").slice(0, maxLines);
  const bLines = b.split("\n").slice(0, maxLines);
  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 && m === 0) return [];
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

export function normalizeViolationRuleId(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "tool") return "tool_use_policy";
  return raw;
}

export function severityScore(value: unknown): number {
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

export function toHumanRuleLabel(ruleId: string, fallback = ""): string {
  if (!ruleId) return fallback || "Behavior check";
  return (
    EVAL_CHECK_LABELS[ruleId] ??
    fallback ??
    ruleId.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
  );
}

export function isCasePassing(run: any): boolean {
  const status = String(run?.case_status ?? "")
    .trim()
    .toLowerCase();
  if (status === "pass") return true;
  if (status === "fail" || status === "flaky") return false;
  return Boolean(run?.pass);
}

export function buildWhatToFixHints(result: any, cases: any[]): FixHint[] {
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
export function summarizeGroundingForCase(run: any): {
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

export function summarizeRunToolGroundingFromCases(resultCases: any[]): {
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

export { getEvalCheckParams } from "@/lib/evalConfigDisplay";

export function formatDateTime(value: unknown): string {
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

export function shortText(value: unknown, fallback = "—", max = 96): string {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function getCasesFromReport(report: any): any[] {
  if (!report || typeof report !== "object") return [];
  if (Array.isArray(report.run_results)) return report.run_results;
  if (Array.isArray(report.case_results)) return report.case_results;
  const rg = (report.summary as Record<string, unknown> | undefined)?.release_gate;
  if (rg && typeof rg === "object" && !Array.isArray(rg)) {
    const nested = (rg as Record<string, unknown>).case_results;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

export function findFirstCaseWithAttempts(cases: any[]): { run: any; caseIndex: number } | null {
  if (!Array.isArray(cases)) return null;
  for (let i = 0; i < cases.length; i++) {
    const attempts = Array.isArray(cases[i]?.attempts) ? cases[i].attempts : [];
    if (attempts.length > 0) return { run: cases[i], caseIndex: i };
  }
  return null;
}
