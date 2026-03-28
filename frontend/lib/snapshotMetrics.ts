/** Shared formatting for snapshot usage rows (Live View detail, Release Gate overlays). */

export function formatSnapshotTokens(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(Number(value)));
}

export function formatSnapshotCost(value: number | string | null | undefined): string {
  if (value == null) return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  }
  const s = String(value).trim();
  return s.length ? s : "—";
}

/** Integer credits (hosted / platform), not necessarily USD. */
export function formatReplayCredits(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(Number(value)));
}
