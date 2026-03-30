/**
 * Human-readable "actual vs config" lines for Live View / Snapshot Detail eval rows.
 * Aligns with backend normalize_eval_config + live_eval_service (fail_* first, legacy warn/crit fallback).
 */

export type EvalDetailSnapshotFields = {
  response_text?: string | null;
  response?: string | null;
  latency_ms?: number | null;
  status_code?: number | null;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getEvalDetailFromConfig(
  s: EvalDetailSnapshotFields,
  checkId: string,
  savedEvalConfig: Record<string, unknown>
): { actualStr: string; configStr: string } {
  const cfg = (savedEvalConfig[checkId] || {}) as Record<string, unknown>;
  const res = String((s.response_text ?? s.response ?? "") || "").trim();
  const len = res.length;
  let actualStr = "—";
  let configStr = "—";
  switch (checkId) {
    case "empty": {
      const minChars = toFiniteNumber(cfg?.min_chars, 16);
      configStr = `min ${minChars} chars`;
      return { actualStr: `${len} chars`, configStr };
    }
    case "latency": {
      const failMs = toFiniteNumber(cfg?.fail_ms ?? cfg?.crit_ms ?? cfg?.warn_ms, 5000);
      configStr = `fail ≥ ${failMs}ms`;
      const ms = s.latency_ms ?? 0;
      return { actualStr: `${ms}ms`, configStr };
    }
    case "status_code": {
      const failFrom = toFiniteNumber(cfg?.fail_from ?? cfg?.crit_from ?? cfg?.warn_from, 500);
      configStr = `fail ≥ ${failFrom}`;
      const code = s.status_code ?? 200;
      return { actualStr: String(code), configStr };
    }
    case "length": {
      const failR = toFiniteNumber(cfg?.fail_ratio ?? cfg?.crit_ratio ?? cfg?.warn_ratio, 0.75);
      configStr = `fail ±${Math.round(failR * 100)}% vs baseline`;
      actualStr = `${len} chars (vs baseline window)`;
      return { actualStr, configStr };
    }
    case "repetition": {
      const failR = toFiniteNumber(
        cfg?.fail_line_repeats ?? cfg?.crit_line_repeats ?? cfg?.warn_line_repeats,
        6
      );
      configStr = `fail ≥ ${failR} repeats`;
      const lines = res
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length >= 4);
      const counts: Record<string, number> = {};
      let maxRep = 0;
      for (const line of lines) {
        counts[line] = (counts[line] || 0) + 1;
        if (counts[line] > maxRep) maxRep = counts[line];
      }
      return { actualStr: maxRep ? `${maxRep} max repeats` : "—", configStr };
    }
    case "json": {
      const mode = String(cfg?.mode || "if_json");
      if (mode === "off") configStr = "off";
      else if (mode === "always") configStr = "always";
      else configStr = "if_json";
      return { actualStr, configStr };
    }
    case "refusal": {
      configStr = "auto-detect refusal / non-answer patterns";
      return { actualStr, configStr };
    }
    case "required": {
      const keywordsCsv = String(cfg?.keywords_csv || "");
      const jsonFieldsCsv = String(cfg?.json_fields_csv || "");
      const keywordCount = keywordsCsv.split(",").filter(part => part.trim().length > 0).length;
      const fieldCount = jsonFieldsCsv.split(",").filter(part => part.trim().length > 0).length;
      configStr = `keywords: ${keywordCount}, json fields: ${fieldCount}`;
      return { actualStr, configStr };
    }
    case "format": {
      const sectionsCsv = String(cfg?.sections_csv || "");
      const sectionCount = sectionsCsv.split(",").filter(part => part.trim().length > 0).length;
      configStr = `required sections: ${sectionCount}`;
      return { actualStr, configStr };
    }
    case "leakage": {
      configStr = "scan for PII (email, phone) & API keys";
      return { actualStr, configStr };
    }
    default:
      return { actualStr, configStr };
  }
}

/** Pick first finite number from candidates (same precedence as backend normalize_eval_config). */
function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

/**
 * Compact param string for Release Gate expanded UI (saved eval check config blob).
 */
export function getEvalCheckParams(id: string, config: Record<string, unknown> | undefined): string {
  if (!config || typeof config !== "object") return "";
  const c = config as Record<string, unknown>;
  switch (id) {
    case "latency": {
      const failMs = firstFiniteNumber(c.fail_ms, c.crit_ms, c.warn_ms);
      if (failMs !== undefined) return `fail_ms: ${failMs}`;
      return "";
    }
    case "json":
      return typeof c.mode === "string" ? `mode: ${c.mode}` : "";
    case "status_code": {
      const failFrom = firstFiniteNumber(c.fail_from, c.crit_from, c.warn_from);
      if (failFrom !== undefined) return `fail_from: ${failFrom}`;
      return "";
    }
    case "empty":
      return typeof c.min_chars === "number" ? `min_chars: ${c.min_chars}` : "";
    case "length": {
      const failR = firstFiniteNumber(c.fail_ratio, c.crit_ratio, c.warn_ratio);
      if (failR !== undefined) return `fail_ratio: ${failR}`;
      return "";
    }
    case "repetition": {
      const failRepeats = firstFiniteNumber(
        c.fail_line_repeats,
        c.crit_line_repeats,
        c.warn_line_repeats
      );
      if (failRepeats !== undefined) return `fail_line_repeats: ${failRepeats}`;
      return "";
    }
    default:
      return "";
  }
}
