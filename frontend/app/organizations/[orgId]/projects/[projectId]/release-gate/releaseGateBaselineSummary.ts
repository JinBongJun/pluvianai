export function buildBaselineConfigSummary(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const obj = payload as Record<string, unknown>;
  const parts: string[] = [];

  const temp = obj.temperature;
  if (typeof temp === "number" && Number.isFinite(temp)) {
    parts.push(`Temp ${temp}`);
  }

  const maxTok = obj.max_tokens;
  if (
    maxTok != null &&
    (typeof maxTok === "number"
      ? Number.isInteger(maxTok)
      : Number.isInteger(Number(maxTok))) &&
    Number(maxTok) > 0
  ) {
    parts.push(`Max ${Number(maxTok)}`);
  }

  const topP = obj.top_p;
  if (typeof topP === "number" && Number.isFinite(topP)) {
    parts.push(`Top p ${topP}`);
  }

  const tools = obj.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    const names: string[] = [];
    for (const t of tools) {
      if (!t || typeof t !== "object") continue;
      const tool = t as Record<string, unknown>;
      const fnRaw = tool.function;
      const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
      const name = String(fn.name ?? tool.name ?? "").trim();
      if (name) names.push(name);
    }
    if (names.length > 0) {
      const previewNames = names.slice(0, 3).join(", ");
      const suffix = names.length > 3 ? `, +${names.length - 3}` : "";
      parts.push(`Tools ${names.length}개 (${previewNames}${suffix})`);
    } else {
      parts.push(`Tools ${tools.length}개`);
    }
  }

  return parts.join(" · ");
}
