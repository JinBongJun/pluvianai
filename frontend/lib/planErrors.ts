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
  metric?: string;
  current?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string | null;
  upgradePath?: string;
};

export function parsePlanLimitError(error: any): PlanLimitError | null {
  const { status, code, message, details } = extractApiErrorPayload(error);
  if (status !== 403 || !code) return null;

  const raw = (details || {}) as Record<string, unknown>;
  const d =
    raw && typeof raw.details === "object" && raw.details !== null
      ? (raw.details as Record<string, unknown>)
      : raw;
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
    message:
      (typeof d.message === "string" ? (d.message as string) : undefined) ||
      (typeof raw.message === "string" ? (raw.message as string) : undefined) ||
      message ||
      "",
    planType: typeof d.plan_type === "string" ? (d.plan_type as string) : undefined,
    metric: typeof d.metric === "string" ? (d.metric as string) : undefined,
    current: num(d.current),
    limit: num(d.limit),
    remaining: num(d.remaining),
    resetAt: typeof d.reset_at === "string" || d.reset_at === null ? (d.reset_at as string | null) : undefined,
    upgradePath: upgradePathRaw,
  };
}

