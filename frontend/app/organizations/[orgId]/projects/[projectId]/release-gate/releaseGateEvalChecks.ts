/** Full list so Release Gate shows all check types from saved config (matches backend CHECK_KEYS order). */
export const LIVE_VIEW_CHECK_ORDER = [
  "empty",
  "latency",
  "status_code",
  "refusal",
  "json",
  "length",
  "repetition",
  "required",
  "format",
  "leakage",
  "tool",
] as const;

/** Defaults for each check so missing keys in old saved config still appear. */
export const DEFAULT_EVAL_CHECK_VALUE: Record<string, { enabled: boolean }> = {
  empty: { enabled: true },
  latency: { enabled: true },
  status_code: { enabled: true },
<<<<<<< HEAD
  refusal: { enabled: true },
  json: { enabled: true },
  length: { enabled: true },
  repetition: { enabled: true },
  required: { enabled: false },
  format: { enabled: false },
  leakage: { enabled: false },
  tool: { enabled: true },
=======
  refusal: { enabled: false },
  json: { enabled: false },
  length: { enabled: false },
  repetition: { enabled: false },
  required: { enabled: false },
  format: { enabled: false },
  leakage: { enabled: false },
  tool: { enabled: false },
>>>>>>> origin/main
};

export function shouldShowEvalSetting(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const obj = value as Record<string, unknown>;
  if (typeof obj.enabled === "boolean") return obj.enabled;
  return true;
}

/** Rows for Release Gate eval settings UI from `liveViewAPI.getAgentEvaluation` (or equivalent) data. */
export function buildRunEvalElementsFromAgentEval(
  agentEvalData: unknown
): Array<{ name: string; value: unknown }> {
  const data = agentEvalData as Record<string, unknown> | undefined;
  const configSrc = data?.config as Record<string, unknown> | undefined;
  if (configSrc && typeof configSrc === "object" && !Array.isArray(configSrc)) {
    const fromConfig = LIVE_VIEW_CHECK_ORDER.map(name => {
      const value =
        configSrc[name] !== undefined ? configSrc[name] : DEFAULT_EVAL_CHECK_VALUE[name];
      return { name, value };
    }).filter(({ value }) => value != null && shouldShowEvalSetting(value));
    if (fromConfig.length > 0) return fromConfig;
  }
  const checksList = data?.checks as
    | Array<{ id: string; enabled?: boolean; applicable?: number }>
    | undefined;
  if (Array.isArray(checksList) && checksList.length > 0) {
    const applied = checksList
      .filter(c => c.enabled === true || (Number(c.applicable) ?? 0) > 0)
      .map(c => ({ name: c.id, value: { enabled: true } as unknown }));
    if (applied.length > 0) {
      const order = [...LIVE_VIEW_CHECK_ORDER, "coherence"];
      const idx = (name: string) => {
        const i = order.indexOf(name);
        return i === -1 ? 999 : i;
      };
      applied.sort((a, b) => idx(a.name) - idx(b.name));
      return applied;
    }
  }
  return [];
}
