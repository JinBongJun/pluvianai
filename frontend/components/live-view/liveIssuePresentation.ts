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

  if (!normalized) return failedEvalLabel || null;

  if (normalized.includes("json")) return "Response format issue";
  if (normalized.includes("empty") || normalized.includes("short")) return "Weak response";
  if (normalized.includes("latency")) return "Slow response";
  if (normalized.includes("http")) return "HTTP error";
  if (normalized.includes("refusal") || normalized.includes("non_answer") || normalized.includes("non-answer")) {
    return "Refusal or non-answer";
  }
  if (normalized.includes("tool")) return "Tooling issue";

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

export function formatCasePreview(value?: string | null): string {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return normalized || "No request text captured";
}
