/** Pure helpers used by ReleaseGateExpandedView and related UI (no React). */

export function snapshotHasPerLogBodyOverride(
  sid: string,
  byId: Record<string, Record<string, unknown>>,
  draftRaw: Record<string, string>
): boolean {
  const merged = byId[sid];
  if (merged && typeof merged === "object" && Object.keys(merged).length > 0) return true;
  const d = draftRaw[sid]?.trim() ?? "";
  if (!d) return false;
  try {
    const p = JSON.parse(d) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p) && Object.keys(p as object).length > 0)
      return true;
  } catch {
    return true;
  }
  return false;
}

export function formatHistoryDateFilterSummary(preset: "all" | "24h" | "7d" | "30d"): string {
  if (preset === "24h") return "Last 24h";
  if (preset === "7d") return "Last 7d";
  if (preset === "30d") return "Last 30d";
  return "All dates";
}

export function percentFromRate(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num * 100)}%`;
}

export function formatDurationMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  const anyErr = error as {
    response?: { data?: { detail?: string | { message?: string } } };
    message?: string;
  };
  const detail = anyErr?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    const msg = detail.message.trim();
    if (msg) return msg;
  }
  const msg = String(anyErr?.message ?? "").trim();
  if (msg) return msg;
  return fallback;
}
