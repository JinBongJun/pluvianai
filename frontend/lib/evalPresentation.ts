import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Clock,
  Code2,
  FileCheck,
  FileText,
  Lock,
  Repeat,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  XCircle,
} from "lucide-react";

export type EvalCheckId =
  | "empty"
  | "latency"
  | "status_code"
  | "refusal"
  | "json"
  | "length"
  | "repetition"
  | "required"
  | "format"
  | "leakage"
  | "tool"
  | "tool_use_policy"
  | "tool_grounding";

export type EvalConfigShape = {
  enabled: boolean;
  empty: { enabled: boolean; min_chars: number };
  latency: { enabled: boolean; fail_ms: number };
  status_code: { enabled: boolean; fail_from: number };
  json: { enabled: boolean; mode: "if_json" | "always" | "off" };
  refusal: { enabled: boolean };
  length: { enabled: boolean; fail_ratio: number };
  repetition: { enabled: boolean; fail_line_repeats: number };
  required: { enabled: boolean; keywords_csv: string; json_fields_csv: string };
  format: { enabled: boolean; sections_csv: string };
  leakage: { enabled: boolean };
  tool_use_policy: { enabled: boolean };
};

export type EvalRow = { id: string; status: string };

export type EvalDetailSnapshotInput = {
  response_text?: unknown;
  response?: unknown;
  latency_ms?: unknown;
  status_code?: unknown;
};

export const LIVE_VIEW_EVAL_CHECK_IDS = [
  "empty",
  "latency",
  "status_code",
  "refusal",
  "json",
  "length",
  "repetition",
  "required",
  "format",
  "leakage",
] as const;

export const POLICY_EVAL_CHECK_IDS = ["tool"] as const;

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

export const EVAL_CHECK_ICONS: Record<string, LucideIcon> = {
  empty: AlertTriangle,
  latency: Clock,
  status_code: XCircle,
  refusal: ShieldAlert,
  json: Code2,
  length: SlidersHorizontal,
  repetition: Repeat,
  required: FileCheck,
  format: FileText,
  leakage: Lock,
  tool: ShieldCheck,
  tool_use_policy: ShieldCheck,
  tool_grounding: Wrench,
};

export const DEFAULT_EVAL_CONFIG: EvalConfigShape = {
  enabled: true,
  empty: { enabled: true, min_chars: 16 },
  latency: { enabled: true, fail_ms: 5000 },
  status_code: { enabled: true, fail_from: 500 },
  json: { enabled: true, mode: "if_json" },
  refusal: { enabled: true },
  length: { enabled: false, fail_ratio: 0.75 },
  repetition: { enabled: false, fail_line_repeats: 6 },
  required: { enabled: false, keywords_csv: "", json_fields_csv: "" },
  format: { enabled: false, sections_csv: "" },
  leakage: { enabled: false },
  tool_use_policy: { enabled: true },
};

export const DEFAULT_EVAL_CHECK_VALUE: Record<string, { enabled: boolean }> = {
  empty: { enabled: DEFAULT_EVAL_CONFIG.empty.enabled },
  latency: { enabled: DEFAULT_EVAL_CONFIG.latency.enabled },
  status_code: { enabled: DEFAULT_EVAL_CONFIG.status_code.enabled },
  refusal: { enabled: DEFAULT_EVAL_CONFIG.refusal.enabled },
  json: { enabled: DEFAULT_EVAL_CONFIG.json.enabled },
  length: { enabled: DEFAULT_EVAL_CONFIG.length.enabled },
  repetition: { enabled: DEFAULT_EVAL_CONFIG.repetition.enabled },
  required: { enabled: DEFAULT_EVAL_CONFIG.required.enabled },
  format: { enabled: DEFAULT_EVAL_CONFIG.format.enabled },
  leakage: { enabled: DEFAULT_EVAL_CONFIG.leakage.enabled },
};

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMsThreshold(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function getResponseLength(input: EvalDetailSnapshotInput): number {
  return String((input.response_text ?? input.response ?? "") || "").trim().length;
}

export function normalizeEvalDisplayId(rawId: string): string {
  return rawId === "tool_use_policy" ? "tool" : rawId;
}

export function normalizeEvalConfigKey(rawId: string): string {
  return rawId === "tool" ? "tool_use_policy" : rawId;
}

export function isEvalSettingEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const enabled = (value as { enabled?: unknown }).enabled;
  if (typeof enabled === "boolean") return enabled;
  return true;
}

export function normalizeEvalConfig(input?: Partial<EvalConfigShape> | null): EvalConfigShape {
  const cfg = (input || {}) as Partial<EvalConfigShape>;
  return {
    enabled: cfg.enabled ?? DEFAULT_EVAL_CONFIG.enabled,
    empty: { ...DEFAULT_EVAL_CONFIG.empty, ...(cfg.empty || {}) },
    latency: { ...DEFAULT_EVAL_CONFIG.latency, ...(cfg.latency || {}) },
    status_code: { ...DEFAULT_EVAL_CONFIG.status_code, ...(cfg.status_code || {}) },
    json: { ...DEFAULT_EVAL_CONFIG.json, ...(cfg.json || {}) },
    refusal: { ...DEFAULT_EVAL_CONFIG.refusal, ...(cfg.refusal || {}) },
    length: { ...DEFAULT_EVAL_CONFIG.length, ...(cfg.length || {}) },
    repetition: { ...DEFAULT_EVAL_CONFIG.repetition, ...(cfg.repetition || {}) },
    required: { ...DEFAULT_EVAL_CONFIG.required, ...(cfg.required || {}) },
    format: { ...DEFAULT_EVAL_CONFIG.format, ...(cfg.format || {}) },
    leakage: { ...DEFAULT_EVAL_CONFIG.leakage, ...(cfg.leakage || {}) },
    tool_use_policy: { ...DEFAULT_EVAL_CONFIG.tool_use_policy, ...(cfg.tool_use_policy || {}) },
  };
}

export function getEvalCheckLabel(checkId: string, fallback = ""): string {
  return (
    EVAL_CHECK_LABELS[normalizeEvalDisplayId(String(checkId || "").trim())] ||
    fallback ||
    String(checkId || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase())
  );
}

export function getEnabledCheckIdsFromConfig(savedEvalConfig: Record<string, unknown>): string[] {
  const enabled: string[] = [];
  const entries = Object.entries(savedEvalConfig || {});
  if (entries.length === 0) return [];
  const order = [...LIVE_VIEW_EVAL_CHECK_IDS, ...POLICY_EVAL_CHECK_IDS];

  for (const [rawKey, value] of entries) {
    const displayId = normalizeEvalDisplayId(rawKey);
    if (!(displayId in EVAL_CHECK_LABELS)) continue;
    if (isEvalSettingEnabled(value)) enabled.push(displayId);
  }

  return Array.from(new Set(enabled)).sort((a, b) => order.indexOf(a as never) - order.indexOf(b as never));
}

export function formatEvalStatus(status: string): string {
  if (status === "na") return "NA";
  if (status === "not_applicable") return "N/A";
  if (status === "not_implemented") return "NOT IMPLEMENTED";
  return status;
}

export function getEvalConfigValue(
  savedEvalConfig: Record<string, unknown>,
  checkId: string
): Record<string, unknown> {
  const configKey = normalizeEvalConfigKey(checkId);
  const raw = savedEvalConfig?.[configKey];
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function formatEvalRuleSummary(checkId: string, config: Record<string, unknown> | undefined): string {
  if (!config || config.enabled === false) return "";
  switch (normalizeEvalDisplayId(checkId)) {
    case "empty":
      return typeof config.min_chars === "number" ? `min ${config.min_chars} chars` : "";
    case "latency": {
      const failMs = toFiniteNumber(config.fail_ms ?? config.crit_ms ?? config.warn_ms, 5000);
      return `fail ≥ ${formatMsThreshold(failMs)}`;
    }
    case "status_code": {
      const failFrom = toFiniteNumber(config.fail_from ?? config.crit_from ?? config.warn_from, 500);
      return `fail ≥${failFrom}`;
    }
    case "json":
      return config.mode === "always"
        ? "always enforce"
        : config.mode === "if_json"
          ? "auto-detect"
          : "";
    case "refusal":
      return "On";
    case "length": {
      const failRatio = toFiniteNumber(config.fail_ratio ?? config.crit_ratio ?? config.warn_ratio, 0.75);
      return `fail ±${Math.round(failRatio * 100)}% vs baseline`;
    }
    case "repetition": {
      const failRepeats = toFiniteNumber(
        config.fail_line_repeats ?? config.crit_line_repeats ?? config.warn_line_repeats,
        6
      );
      return `fail ≥ ${failRepeats} repeats`;
    }
    case "required":
      return String(config.keywords_csv || "").trim() || String(config.json_fields_csv || "").trim()
        ? "keywords/fields set"
        : "On";
    case "format":
      return String(config.sections_csv || "").trim() ? "sections set" : "On";
    case "leakage":
      return "On";
    case "tool":
      return "On";
    default:
      return "";
  }
}

export function getEvalCheckParams(
  checkId: string,
  config: Record<string, unknown> | undefined
): string {
  if (!config || typeof config !== "object") return "";
  switch (normalizeEvalDisplayId(checkId)) {
    case "json":
      return typeof config.mode === "string" ? `mode: ${config.mode}` : "";
    case "required": {
      const keywords = String(config.keywords_csv || "").trim();
      const fields = String(config.json_fields_csv || "").trim();
      if (keywords && fields) return "keywords + json fields";
      if (keywords) return "keywords set";
      if (fields) return "json fields set";
      return "";
    }
    case "format":
      return String(config.sections_csv || "").trim() ? "sections set" : "";
    default:
      return formatEvalRuleSummary(checkId, config);
  }
}

export function getEvalDetail(
  snapshot: EvalDetailSnapshotInput,
  checkId: string,
  savedEvalConfig: Record<string, unknown>
): { actualStr: string; configStr: string } {
  const cfg = getEvalConfigValue(savedEvalConfig, checkId);
  const responseLength = getResponseLength(snapshot);
  const normalizedId = normalizeEvalDisplayId(checkId);

  switch (normalizedId) {
    case "empty": {
      const minChars = toFiniteNumber(cfg.min_chars, 16);
      return { actualStr: `${responseLength} chars`, configStr: `min ${minChars} chars` };
    }
    case "latency": {
      const failMs = toFiniteNumber(cfg.fail_ms ?? cfg.crit_ms ?? cfg.warn_ms, 5000);
      const ms = toFiniteNumber(snapshot.latency_ms, 0);
      return { actualStr: `${ms}ms`, configStr: `fail ≥ ${failMs}ms` };
    }
    case "status_code": {
      const failFrom = toFiniteNumber(cfg.fail_from ?? cfg.crit_from ?? cfg.warn_from, 500);
      const statusCode = toFiniteNumber(snapshot.status_code, 200);
      return { actualStr: String(statusCode), configStr: `fail ≥ ${failFrom}` };
    }
    case "length": {
      const failRatio = toFiniteNumber(cfg.fail_ratio ?? cfg.crit_ratio ?? cfg.warn_ratio, 0.75);
      return {
        actualStr: `${responseLength} chars (vs baseline window)`,
        configStr: `fail ±${Math.round(failRatio * 100)}% vs baseline`,
      };
    }
    case "repetition": {
      const failRepeats = toFiniteNumber(
        cfg.fail_line_repeats ?? cfg.crit_line_repeats ?? cfg.warn_line_repeats,
        6
      );
      const lines = String((snapshot.response_text ?? snapshot.response ?? "") || "")
        .trim()
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length >= 4);
      const counts: Record<string, number> = {};
      let maxRepeats = 0;
      for (const line of lines) {
        counts[line] = (counts[line] || 0) + 1;
        if (counts[line] > maxRepeats) maxRepeats = counts[line];
      }
      return {
        actualStr: maxRepeats ? `${maxRepeats} max repeats` : "—",
        configStr: `fail ≥ ${failRepeats} repeats`,
      };
    }
    case "json": {
      const mode = String(cfg.mode || "if_json");
      return { actualStr: "—", configStr: mode === "if_json" ? "if_json" : "always" };
    }
    case "refusal":
      return { actualStr: "—", configStr: "auto-detect refusal / non-answer patterns" };
    case "required": {
      const keywordCount = String(cfg.keywords_csv || "")
        .split(",")
        .filter(part => part.trim().length > 0).length;
      const fieldCount = String(cfg.json_fields_csv || "")
        .split(",")
        .filter(part => part.trim().length > 0).length;
      return { actualStr: "—", configStr: `keywords: ${keywordCount}, json fields: ${fieldCount}` };
    }
    case "format": {
      const sectionCount = String(cfg.sections_csv || "")
        .split(",")
        .filter(part => part.trim().length > 0).length;
      return { actualStr: "—", configStr: `required sections: ${sectionCount}` };
    }
    case "leakage":
      return { actualStr: "—", configStr: "scan for PII (email, phone) & API keys" };
    case "tool":
      return {
        actualStr: "—",
        configStr: "Tool Use Policy validates policy only; it is not a substitute for a captured tool trace.",
      };
    default:
      return { actualStr: "—", configStr: "—" };
  }
}
