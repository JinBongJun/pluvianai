import { getEvalCheckLabel, type EvalRow } from "@/lib/evalPresentation";

export type SnapshotRiskCategory =
  | "response_quality"
  | "reliability"
  | "latency"
  | "system_api"
  | "policy"
  | "custom";

export type SnapshotRiskLevel = "safe" | "needs_review" | "unsafe";

export type SnapshotRiskSummary = {
  level: SnapshotRiskLevel;
  category: SnapshotRiskCategory;
  categoryLabel: string;
  headline: string;
  impact: string;
  failedCheckLabels: string[];
};

const CATEGORY_PRIORITY: SnapshotRiskCategory[] = [
  "system_api",
  "policy",
  "latency",
  "reliability",
  "response_quality",
  "custom",
];

function mapEvalIdToCategory(evalId: string): SnapshotRiskCategory {
  switch (String(evalId || "").trim()) {
    case "status_code":
      return "system_api";
    case "tool":
    case "tool_use_policy":
    case "tool_grounding":
      return "policy";
    case "latency":
      return "latency";
    case "empty":
    case "refusal":
    case "json":
    case "length":
    case "repetition":
    case "required":
    case "format":
    case "leakage":
      return "response_quality";
    default:
      return "custom";
  }
}

function getCategoryLabel(category: SnapshotRiskCategory): string {
  switch (category) {
    case "response_quality":
      return "Response Quality Risk";
    case "reliability":
      return "Reliability Risk";
    case "latency":
      return "Latency Risk";
    case "system_api":
      return "System/API Risk";
    case "policy":
      return "Policy Risk";
    default:
      return "Custom Evaluation Risk";
  }
}

function getImpactCopy(category: SnapshotRiskCategory, latencyMs?: number | null): string {
  switch (category) {
    case "response_quality":
      return "This output may look acceptable at a glance but still fail the expected response contract for real users.";
    case "reliability":
      return "This behavior may not stay stable across repeated runs, which increases release risk.";
    case "latency":
      return latencyMs != null
        ? `This run took ${latencyMs}ms, which may feel slow or unreliable to users.`
        : "This run exceeded the expected latency threshold and may feel slow or unreliable to users.";
    case "system_api":
      return "This run hit a system or API-level failure that can break the end-user flow.";
    case "policy":
      return "This run violated a policy or tool-use constraint that should be reviewed before shipping.";
    default:
      return "A custom evaluation failed on this run and should be reviewed before shipping.";
  }
}

function getHeadline(level: SnapshotRiskLevel, categoryLabel: string): string {
  if (level === "safe") return "This run looks safe";
  if (level === "unsafe") return `${categoryLabel} detected`;
  return `${categoryLabel} needs review`;
}

export function buildSnapshotRiskSummary(options: {
  evalRows: EvalRow[];
  latencyMs?: number | null;
}): SnapshotRiskSummary {
  const failedRows = options.evalRows.filter(row => row.status === "fail");
  const failedCheckLabels = failedRows.map(row => getEvalCheckLabel(row.id, row.id));

  if (failedRows.length === 0) {
    return {
      level: "safe",
      category: "response_quality",
      categoryLabel: "No Active Risk",
      headline: "This run looks safe",
      impact: "No saved evaluation checks failed on this snapshot.",
      failedCheckLabels: [],
    };
  }

  const categories = new Set<SnapshotRiskCategory>(failedRows.map(row => mapEvalIdToCategory(row.id)));
  const category =
    CATEGORY_PRIORITY.find(candidate => categories.has(candidate)) ?? "custom";
  const categoryLabel = getCategoryLabel(category);
  const level: SnapshotRiskLevel =
    category === "system_api" || category === "policy" ? "unsafe" : "needs_review";

  return {
    level,
    category,
    categoryLabel,
    headline: getHeadline(level, categoryLabel),
    impact: getImpactCopy(category, options.latencyMs),
    failedCheckLabels,
  };
}
