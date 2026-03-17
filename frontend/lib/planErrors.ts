import { extractApiErrorPayload } from "./api/client";

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

  const upgradePathRaw =
    (typeof (d.upgrade_path as string | undefined) === "string"
      ? (d.upgrade_path as string)
      : "/organizations") || "/organizations";

  return {
    code,
    message: (d.message as string) || message || "",
    planType: typeof d.plan_type === "string" ? (d.plan_type as string) : undefined,
    current: num(d.current),
    limit: num(d.limit),
    upgradePath: upgradePathRaw.startsWith("/") ? upgradePathRaw : "/organizations",
  };
}

