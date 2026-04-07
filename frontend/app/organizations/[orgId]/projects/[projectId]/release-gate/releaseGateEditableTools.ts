import type { ReleaseGateEditableTool } from "./releaseGatePageContext.types";
import type { LiveViewToolTimelineRow } from "@/lib/api/live-view";

export type EditableTool = ReleaseGateEditableTool;

export function extractToolsFromPayload(payload: Record<string, unknown> | null): EditableTool[] {
  if (!payload) return [];
  const rawTools = payload.tools;
  if (!Array.isArray(rawTools)) return [];
  const out: EditableTool[] = [];
  for (const item of rawTools) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fnRaw = obj.function;
    const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
    const name = String(fn.name ?? obj.name ?? "").trim();
    if (!name) continue;
    const description =
      typeof fn.description === "string"
        ? fn.description
        : typeof obj.description === "string"
          ? obj.description
          : "";
    const paramsObj =
      fn.parameters && typeof fn.parameters === "object"
        ? fn.parameters
        : obj.parameters && typeof obj.parameters === "object"
          ? obj.parameters
          : null;
    out.push({
      id: crypto.randomUUID(),
      name,
      description,
      parameters: paramsObj ? JSON.stringify(paramsObj, null, 2) : "{}",
      baselineSampleSummary: "",
    });
  }
  return out;
}

export function extractToolsFromTimelineRows(rows: LiveViewToolTimelineRow[]): EditableTool[] {
  const seen = new Set<string>();
  const out: EditableTool[] = [];
  for (const row of rows) {
    const stepType = String(row.step_type || "").trim().toLowerCase();
    if (stepType !== "tool_call" && stepType !== "tool_result") continue;
    const name = String(row.tool_name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: crypto.randomUUID(),
      name,
      description: "",
      parameters: '{\n  "type": "object",\n  "properties": {}\n}',
      toolType: "retrieval",
      expectedResultFields: [],
      expectedActionFields: [],
      resultGuide: "",
      baselineSampleSummary: "",
    });
  }
  return out;
}

/** OpenAI-style `tools` array for replay payloads, built from the editable tools table. */
export function buildOpenAIStyleToolsFromEditableTools(
  tools: EditableTool[]
): Array<Record<string, unknown>> {
  const built: Array<Record<string, unknown>> = [];
  for (const t of tools) {
    const name = t.name.trim();
    if (!name) continue;
    let params: Record<string, unknown> = {};
    if (t.parameters.trim()) {
      try {
        const p = JSON.parse(t.parameters.trim());
        if (p && typeof p === "object") params = p as Record<string, unknown>;
      } catch {
        continue;
      }
    }
    built.push({
      type: "function",
      function: {
        name,
        description: t.description.trim() || undefined,
        ...(Object.keys(params).length ? { parameters: params } : {}),
      },
    });
  }
  return built;
}
