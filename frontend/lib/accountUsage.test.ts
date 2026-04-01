import { describe, expect, it } from "vitest";

import { computeAccountUsageMetrics, getUsagePeriodPayload } from "./accountUsage";

describe("accountUsage", () => {
  it("prefers usage_current_period when available", () => {
    const payload = getUsagePeriodPayload({
      usage_current_period: { snapshots: 11, release_gate_attempts: 7 },
      usage_this_month: { snapshots: 99, release_gate_attempts: 88 },
    } as never);

    expect(payload).toMatchObject({ snapshots: 11, release_gate_attempts: 7 });
  });

  it("falls back across replay usage aliases", () => {
    const metrics = computeAccountUsageMetrics({
      plan_type: "starter",
      display_plan_type: "starter",
      subscription_status: "active",
      entitlement_status: "active",
      limits: { release_gate_attempts_per_month: 600, snapshots_per_month: 50000 },
      usage_current_period: { platform_replay_credits: 42, snapshots: 5 },
    } as never);

    expect(metrics?.snapshotsUsed).toBe(5);
    expect(metrics?.replayUsed).toBe(42);
    expect(metrics?.replayLimit).toBe(600);
  });

  it("uses guard credits as the final replay fallback", () => {
    const metrics = computeAccountUsageMetrics({
      plan_type: "free",
      display_plan_type: "free",
      subscription_status: "active",
      entitlement_status: "active",
      limits: { guard_credits_per_month: 60, snapshots_per_month: 10000 },
      usage_this_month: { guard_credits: 9, snapshots: 3 },
    } as never);

    expect(metrics?.replayUsed).toBe(9);
    expect(metrics?.snapshotsUsed).toBe(3);
  });
});
