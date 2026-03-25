import type { ToolContextPayload } from "@/lib/api";

export function extractToolResultTextFromSnapshotRecord(snapshot: Record<string, unknown>): string {
  const payload = snapshot.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const raw = (payload as Record<string, unknown>).tool_events;
  if (!Array.isArray(raw)) return "";
  const parts: string[] = [];
  for (const ev of raw) {
    if (!ev || typeof ev !== "object") continue;
    const row = ev as Record<string, unknown>;
    if (String(row.kind || "").toLowerCase() !== "tool_result") continue;
    const out = row.output;
    if (typeof out === "string") parts.push(out);
    else if (out != null) {
      try {
        parts.push(JSON.stringify(out, null, 2));
      } catch {
        parts.push(String(out));
      }
    }
  }
  return parts.join("\n\n---\n\n");
}

export function buildToolContextPayload(
  mode: "recorded" | "inject",
  scope: "global" | "per_snapshot",
  globalText: string,
  bySnapshotId: Record<string, string>
): ToolContextPayload {
  if (mode === "recorded") return { mode: "recorded" };
  const inject: {
    scope: "per_snapshot" | "global";
    global_text?: string;
    by_snapshot_id?: Record<string, string>;
  } = { scope };
  const gt = globalText.trim();
  if (gt) inject.global_text = gt;
  if (scope === "per_snapshot") {
    const by: Record<string, string> = {};
    for (const [k, v] of Object.entries(bySnapshotId)) {
      if (v.trim()) by[k] = v.trim();
    }
    if (Object.keys(by).length) inject.by_snapshot_id = by;
  }
  return { mode: "inject", inject };
}
