export type SurfaceStatusTone = "attention" | "good";

export type SurfaceStatus = {
  label: "Needs attention" | "Looks good";
  reason: string;
  tone: SurfaceStatusTone;
};

function mapFailedCheckToIssueTitle(failedEvalId?: string, failedEvalLabel?: string): string | null {
  const normalized = String(failedEvalId || "")
    .trim()
    .toLowerCase();
  const normalizedLabel = String(failedEvalLabel || "")
    .trim()
    .toLowerCase();

  if (!normalized && !normalizedLabel) return failedEvalLabel || null;

  const combined = `${normalized} ${normalizedLabel}`;

  if (combined.includes("json")) return "Response format issue";
  if (combined.includes("empty") || combined.includes("short")) return "Weak response";
  if (combined.includes("latency")) return "Slow response";
  if (combined.includes("http")) return "HTTP error";
  if (combined.includes("refusal") || combined.includes("non_answer") || combined.includes("non-answer")) {
    return "Refusal or non-answer";
  }
  if (combined.includes("tool")) return "Tooling issue";

  return failedEvalLabel || failedEvalId || null;
}

export function buildSurfaceStatus(args: {
  failedCount: number;
  passedCount: number;
  evalRowsCount: number;
  hasToolDefinitions: boolean;
  hasToolResults: boolean;
}): SurfaceStatus {
  const { failedCount, passedCount, evalRowsCount, hasToolDefinitions, hasToolResults } = args;

  if (failedCount > 0) {
    return {
      label: "Needs attention",
      reason:
        evalRowsCount > 0 ? `${failedCount}/${evalRowsCount} checks failed` : "Latest run needs review",
      tone: "attention",
    };
  }

  if (hasToolDefinitions && !hasToolResults) {
    return {
      label: "Needs attention",
      reason: "Tool setup required",
      tone: "attention",
    };
  }

  if (evalRowsCount > 0) {
    return {
      label: "Looks good",
      reason: `${passedCount}/${evalRowsCount} checks passed`,
      tone: "good",
    };
  }

  return {
    label: "Looks good",
    reason: "Latest run recorded",
    tone: "good",
  };
}

export function buildIssueTitle(args: {
  failedEvalId?: string;
  failedEvalLabel?: string;
  hasToolDefinitions: boolean;
  hasToolResults: boolean;
  failedCount: number;
}): string {
  const { failedEvalId, failedEvalLabel, hasToolDefinitions, hasToolResults, failedCount } = args;
  if (failedCount > 0) {
    const mapped = mapFailedCheckToIssueTitle(failedEvalId, failedEvalLabel);
    if (mapped) return mapped;
  }
  if (hasToolDefinitions && !hasToolResults) return "Tool-assisted request";
  return "Latest response";
}

export function formatCasePreview(value?: string | null, maxLength = 72): string {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "No input preview";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
