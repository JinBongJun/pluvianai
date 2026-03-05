/**
 * Shared eval row helpers: build EvalRow[] from snapshot.eval_checks_result (stored eval).
 * Use this everywhere so list and detail show the same evaluation (single source of truth).
 */

export type EvalRow = { id: string; status: string };

function normalizeEvalCheckId(rawId: string): string {
  return rawId === "tool_use_policy" ? "tool" : rawId;
}

/**
 * Build eval rows from a snapshot's stored eval_checks_result (DB).
 * Returns [] if snapshot or eval_checks_result is missing/invalid.
 */
export function toEvalRows(
  snapshot: Record<string, unknown> | null | undefined
): EvalRow[] {
  if (!snapshot) return [];
  const checks = snapshot.eval_checks_result;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return [];
  return Object.entries(checks as Record<string, unknown>)
    .filter(([, status]) => typeof status === "string")
    .map(([id, status]) => ({
      id: normalizeEvalCheckId(id),
      status: String(status),
    }));
}
