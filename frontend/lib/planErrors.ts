import { extractApiErrorPayload } from "./api/client";

/** App routes billing at `/settings/billing`; legacy API responses used `/settings/subscription`. */
const BILLING_PATH = "/settings/billing";

function normalizeUpgradePath(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("/")) return BILLING_PATH;
  if (t === "/settings/subscription" || t.startsWith("/settings/subscription?")) {
    return t.replace(/^\/settings\/subscription/, BILLING_PATH);
  }
  return t;
}

export type PlanLimitError = {
  code: string;
  message: string;
  planType?: string;
  current?: number;
  limit?: number;
  upgradePath?: string;
};

export function parsePlanLimitError(error: any): PlanLimitError | null {
  const { status, code, message, details } = extractApiErrorPayload(error);
  if (status !== 403 || !code) return null;

  const d = (details || {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const fromDetails =
    typeof (d.upgrade_path as string | undefined) === "string"
      ? (d.upgrade_path as string)
      : typeof (d.upgrade_url as string | undefined) === "string"
        ? (d.upgrade_url as string)
        : null;

  const upgradePathRaw = fromDetails ? normalizeUpgradePath(fromDetails) : BILLING_PATH;

  return {
    code,
    message: (d.message as string) || message || "",
    planType: typeof d.plan_type === "string" ? (d.plan_type as string) : undefined,
    current: num(d.current),
    limit: num(d.limit),
    upgradePath: upgradePathRaw,
  };
}

