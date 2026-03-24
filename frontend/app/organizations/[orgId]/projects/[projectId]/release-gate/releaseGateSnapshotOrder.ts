export function parseSnapshotCreatedAtMs(snapshot: Record<string, unknown> | null | undefined): number {
  if (!snapshot) return 0;
  const raw = snapshot.created_at;
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export function snapshotNumericId(snapshot: Record<string, unknown>): number {
  const id = snapshot?.id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  const n = Number(id);
  return Number.isFinite(n) ? n : 0;
}

export function compareSnapshotsNewestFirst(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const ta = parseSnapshotCreatedAtMs(a);
  const tb = parseSnapshotCreatedAtMs(b);
  if (tb !== ta) return tb - ta;
  return snapshotNumericId(b) - snapshotNumericId(a);
}

export function pickNewestSnapshot(snapshots: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!snapshots.length) return null;
  return [...snapshots].sort(compareSnapshotsNewestFirst)[0] ?? null;
}
