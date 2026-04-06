import { buildIssueTitle, buildSurfaceStatus, formatCasePreview } from "@/components/live-view/liveIssuePresentation";

export function buildLiveIssueRowModel(args: {
  requestText?: string | null;
  model: string;
  failedEvalId?: string;
  failedEvalLabel?: string;
  hasToolDefinitions: boolean;
  hasToolResults: boolean;
  failedCount: number;
  passedCount: number;
  evalRowsCount: number;
}) {
  const {
    requestText,
    model,
    failedEvalId,
    failedEvalLabel,
    hasToolDefinitions,
    hasToolResults,
    failedCount,
    passedCount,
    evalRowsCount,
  } = args;

  return {
    issueTitle: buildIssueTitle({
      failedEvalId,
      failedEvalLabel,
      hasToolDefinitions,
      hasToolResults,
      failedCount,
    }),
    casePreview: formatCasePreview(requestText),
    modelLabel: model.split("/")[1] || model,
    surfaceStatus: buildSurfaceStatus({
      failedCount,
      passedCount,
      evalRowsCount,
      hasToolDefinitions,
      hasToolResults,
    }),
    actionLabel: "Details",
  };
}
