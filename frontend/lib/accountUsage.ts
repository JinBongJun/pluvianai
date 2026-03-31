/**
 * Account-level usage from GET /auth/me/usage — shared by Settings → Usage, Live View, Release Gate.
 * Keep in sync with `frontend/app/settings/usage/page.tsx` product rules.
 */

import { authAPI } from "@/lib/api/auth";

/** SWR cache key — use everywhere that calls `authAPI.getMyUsage`. */
export const ACCOUNT_USAGE_SWR_KEY = "my-usage" as const;

export type AccountUsageApiResponse = Awaited<ReturnType<typeof authAPI.getMyUsage>>;

/** When API limits are missing, match Phase 0 product defaults (subscription_limits.py). */
export const ACCOUNT_USAGE_FALLBACK_BY_PLAN: Record<
  string,
  { projects: number; organizations: number; replay: number }
> = {
  free: { projects: 2, organizations: 1, replay: 60 },
  starter: { projects: 8, organizations: 3, replay: 600 },
  pro: { projects: 30, organizations: 10, replay: 3000 },
  enterprise: { projects: -1, organizations: -1, replay: -1 },
};

export function accountUsageAsNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type AccountUsageMetrics = {
  planType: string;
  displayPlanType: string;
  subscriptionStatus: string;
  entitlementStatus: string;
  snapshotsUsed: number;
  /** 0 or negative means unlimited for display bar purposes */
  snapshotsLimit: number;
  replayUsed: number;
  replayLimit: number;
  snapshotsExhausted: boolean;
  replayExhausted: boolean;
  snapshotsNearLimit: boolean;
  replayNearLimit: boolean;
};

export function computeAccountUsageMetrics(
  data: AccountUsageApiResponse | null | undefined
): AccountUsageMetrics | null {
  if (!data) return null;

  const planType = (data.plan_type || "free").toLowerCase();
  const displayPlanType = (data.display_plan_type || data.plan_type || "free").toLowerCase();
  const subscriptionStatus = String(data.subscription_status || "active").toLowerCase();
  const entitlementStatus = String(data.entitlement_status || "active").toLowerCase();
  const limits = data.limits || {};
  const usage = data.usage_this_month || {};
  const fb = ACCOUNT_USAGE_FALLBACK_BY_PLAN[displayPlanType] ?? ACCOUNT_USAGE_FALLBACK_BY_PLAN.free;

  const snapshotsUsed = usage.snapshots ?? 0;
  const snapshotsLimit = accountUsageAsNumber(
    (limits as Record<string, unknown>).snapshots_per_month,
    accountUsageAsNumber((limits as Record<string, unknown>).api_calls_per_month, 10000)
  );

  const replayUsed =
    (usage as { release_gate_attempts?: number; platform_replay_credits?: number; guard_credits?: number })
      .release_gate_attempts ??
    (usage as { platform_replay_credits?: number; guard_credits?: number }).platform_replay_credits ??
    (usage as { guard_credits?: number }).guard_credits ??
    0;
  const replayLimit = accountUsageAsNumber(
    (limits as Record<string, unknown>).release_gate_attempts_per_month ??
      (limits as Record<string, unknown>).platform_replay_credits_per_month ??
      (limits as Record<string, unknown>).guard_credits_per_month,
    fb.replay
  );

  const snapshotsExhausted = snapshotsLimit > 0 && snapshotsUsed >= snapshotsLimit;
  const replayExhausted = replayLimit > 0 && replayUsed >= replayLimit;
  const snapshotsNearLimit =
    snapshotsLimit > 0 && !snapshotsExhausted && (snapshotsUsed / snapshotsLimit) * 100 >= 80;
  const replayNearLimit =
    replayLimit > 0 && !replayExhausted && (replayUsed / replayLimit) * 100 >= 80;

  return {
    planType,
    displayPlanType,
    subscriptionStatus,
    entitlementStatus,
    snapshotsUsed,
    snapshotsLimit,
    replayUsed,
    replayLimit,
    snapshotsExhausted,
    replayExhausted,
    snapshotsNearLimit,
    replayNearLimit,
  };
}

/** Display limit: positive = cap, otherwise unlimited symbol. */
export function formatUsageLimit(limit: number): string {
  if (limit == null || Number.isNaN(limit) || limit <= 0) return "∞";
  return String(limit);
}

export function usageQuotaPercent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
}
