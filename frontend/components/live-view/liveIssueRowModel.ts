import { buildSurfaceStatus, formatCasePreview } from "@/components/live-view/liveIssuePresentation";

export function buildLiveIssueRowModel(args: {
  requestText?: string | null;
  model: string;
  hasToolDefinitions: boolean;
  hasToolResults: boolean;
  failedCount: number;
  passedCount: number;
  evalRowsCount: number;
}) {
  const {
    requestText,
    model,
    hasToolDefinitions,
    hasToolResults,
    failedCount,
    passedCount,
    evalRowsCount,
  } = args;

  return {
    casePreview: formatCasePreview(requestText),
    modelLabel: model.split("/")[1] || model,
    surfaceStatus: buildSurfaceStatus({
      failedCount,
      passedCount,
      evalRowsCount,
      hasToolDefinitions,
      hasToolResults,
    }),
  };
}
