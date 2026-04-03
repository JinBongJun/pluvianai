import type { ReleaseGateHistoryItem, ReleaseGateResult } from "@/lib/api";

export type CompletedReleaseGateResultEntry = {
  reportId: string;
  result: ReleaseGateResult;
  completedAtMs: number;
};

export function mergeCompletedReleaseGateEntries(
  current: CompletedReleaseGateResultEntry[],
  incoming: CompletedReleaseGateResultEntry[]
): CompletedReleaseGateResultEntry[] {
  const byReportId = new Map<string, CompletedReleaseGateResultEntry>();
  for (const entry of current) {
    const reportId = String(entry.reportId || "").trim();
    if (!reportId) continue;
    byReportId.set(reportId, entry);
  }
  for (const entry of incoming) {
    const reportId = String(entry.reportId || "").trim();
    if (!reportId) continue;
    const previous = byReportId.get(reportId);
    if (!previous || Number(entry.completedAtMs || 0) >= Number(previous.completedAtMs || 0)) {
      byReportId.set(reportId, entry);
    }
  }
  return Array.from(byReportId.values()).sort((a, b) => b.completedAtMs - a.completedAtMs);
}

export function parseCompletedAtMs(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return Date.now();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function mapExportedReportToCompletedReleaseGateEntry(
  report: unknown,
  fallbackCreatedAt?: string | null
): CompletedReleaseGateResultEntry | null {
  if (!report || typeof report !== "object") return null;
  const reportObj = report as Record<string, unknown>;
  const reportId = String(reportObj.id ?? "").trim();
  const summary = reportObj.summary;
  if (!reportId || !summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const releaseGateSummary = (summary as Record<string, unknown>).release_gate;
  if (
    !releaseGateSummary ||
    typeof releaseGateSummary !== "object" ||
    Array.isArray(releaseGateSummary)
  ) {
    return null;
  }
  const result = {
    ...(releaseGateSummary as Record<string, unknown>),
    report_id: reportId,
    case_results: Array.isArray(reportObj.case_results)
      ? reportObj.case_results
      : (releaseGateSummary as Record<string, unknown>).case_results,
  } as ReleaseGateResult;
  return {
    reportId,
    result,
    completedAtMs: parseCompletedAtMs(reportObj.created_at ?? fallbackCreatedAt),
  };
}

export function mapHistoryItemToCompletedReleaseGateEntry(
  item: Pick<ReleaseGateHistoryItem, "report_id" | "created_at" | "session_created_at" | "session_result">
): CompletedReleaseGateResultEntry | null {
  const reportId = String(item?.report_id || "").trim();
  const sessionResult = item?.session_result;
  if (!reportId || !sessionResult || typeof sessionResult !== "object") return null;
  return {
    reportId,
    result: {
      ...(sessionResult as ReleaseGateResult),
      report_id: reportId,
    },
    completedAtMs: parseCompletedAtMs(item.session_created_at ?? item.created_at),
  };
}
