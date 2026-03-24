export type HistoryDatePreset = "all" | "24h" | "7d" | "30d";

export function getPresetHistoryDateRange(
  preset: HistoryDatePreset
): { createdFrom?: string; createdTo?: string } {
  if (preset === "all") return {};
  const now = new Date();
  const createdTo = now.toISOString();
  const ms =
    preset === "24h"
      ? 24 * 60 * 60 * 1000
      : preset === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  return { createdFrom: new Date(now.getTime() - ms).toISOString(), createdTo };
}
