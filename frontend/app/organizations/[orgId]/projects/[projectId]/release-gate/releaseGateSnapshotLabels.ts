import { parseSnapshotCreatedAtMs } from "./releaseGateSnapshotOrder";
import { asPayloadObject, getRequestPart } from "./releaseGatePayloadParts";

function firstUserMessageSnippetFromRequest(req: Record<string, unknown> | null, maxLen = 72): string {
  if (!req) return "";
  const msgs = req.messages;
  if (!Array.isArray(msgs)) return "";
  for (const msg of msgs) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    const role = String(m.role || "").toLowerCase();
    if (role !== "user" && role !== "human") continue;
    const c = m.content;
    let text = "";
    if (typeof c === "string") text = c;
    else if (Array.isArray(c)) {
      const parts: string[] = [];
      for (const part of c) {
        if (typeof part === "string") parts.push(part);
        else if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") parts.push(p.text);
        }
      }
      text = parts.join(" ");
    }
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) continue;
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
  }
  return "";
}

/**
 * Human-readable primary line + stable id line for per-log Release Gate editors.
 */
export function formatSnapshotShortLabel(
  snapshotId: string,
  record: Record<string, unknown> | undefined
): { primary: string; idLine: string } {
  const idLine = `Snapshot id ${snapshotId}`;
  if (!record) {
    return { primary: `Log #${snapshotId}`, idLine };
  }
  const createdMs = parseSnapshotCreatedAtMs(record);
  const timePart =
    createdMs > 0
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(createdMs)
        )
      : "";
  const rawPayload = asPayloadObject(record.payload);
  const req = rawPayload ? getRequestPart(rawPayload) : null;
  const snippet = firstUserMessageSnippetFromRequest(req, 72);
  const parts: string[] = [];
  if (timePart) parts.push(timePart);
  if (snippet) parts.push(`“${snippet}”`);
  const primary = parts.length > 0 ? parts.join(" · ") : `Log #${snapshotId}`;
  return { primary, idLine };
}
