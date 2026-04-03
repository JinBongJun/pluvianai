export type GraphAgentDigestRow = {
  agent_id?: string | null;
  display_name?: string | null;
  last_seen?: string | null;
  total?: number | null;
  worst_count?: number | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  is_official?: boolean | null;
  is_ghost?: boolean | null;
  drift_status?: string | null;
};

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown): string {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "";
}

function normalizeBoolean(value: unknown): string {
  return value === true ? "1" : "0";
}

export function buildGraphAgentDigest(rows: GraphAgentDigestRow[]): string {
  return rows
    .map(row => ({
      agentId: normalizeString(row.agent_id),
      displayName: normalizeString(row.display_name),
      lastSeen: normalizeString(row.last_seen),
      total: normalizeNumber(row.total),
      worstCount: normalizeNumber(row.worst_count),
      isDeleted: normalizeBoolean(row.is_deleted),
      deletedAt: normalizeString(row.deleted_at),
      isOfficial: normalizeBoolean(row.is_official),
      isGhost: normalizeBoolean(row.is_ghost),
      driftStatus: normalizeString(row.drift_status),
    }))
    .sort((a, b) => a.agentId.localeCompare(b.agentId))
    .map(row =>
      [
        row.agentId,
        row.displayName,
        row.lastSeen,
        row.total,
        row.worstCount,
        row.isDeleted,
        row.deletedAt,
        row.isOfficial,
        row.isGhost,
        row.driftStatus,
      ].join("|")
    )
    .join("||");
}
