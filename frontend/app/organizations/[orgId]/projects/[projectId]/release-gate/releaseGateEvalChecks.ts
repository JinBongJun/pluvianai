/** Release Gate eval signal checks. Tool Use Policy is tracked separately as a policy check. */
import {
  DEFAULT_EVAL_CHECK_VALUE,
  LIVE_VIEW_EVAL_CHECK_IDS as LIVE_VIEW_CHECK_ORDER,
  isEvalSettingEnabled as shouldShowEvalSetting,
} from "@/lib/evalPresentation";

export const POLICY_CHECK_IDS = ["tool"] as const;

export const RUNTIME_ONLY_EVAL_CHECK_IDS = [
  "tool_grounding",
  "required_keywords",
  "required_json_fields",
] as const;

const CANONICAL_EVAL_CHECK_ID_SET = new Set<string>(LIVE_VIEW_CHECK_ORDER);
const POLICY_CHECK_ID_SET = new Set<string>(POLICY_CHECK_IDS);
const RUNTIME_ONLY_EVAL_CHECK_ID_SET = new Set<string>(RUNTIME_ONLY_EVAL_CHECK_IDS);

export function isCanonicalEvalCheckId(id: string): boolean {
  return CANONICAL_EVAL_CHECK_ID_SET.has(String(id || "").trim());
}

export function isRuntimeOnlyEvalCheckId(id: string): boolean {
  return RUNTIME_ONLY_EVAL_CHECK_ID_SET.has(String(id || "").trim());
}

export function isPolicyCheckId(id: string): boolean {
  return POLICY_CHECK_ID_SET.has(String(id || "").trim());
}

export function getConfiguredEvalCheckIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(id => String(id ?? "").trim())
    .filter(id => isCanonicalEvalCheckId(id));
}

export function getConfiguredPolicyCheckIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(id => String(id ?? "").trim())
    .filter(id => isPolicyCheckId(id));
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
