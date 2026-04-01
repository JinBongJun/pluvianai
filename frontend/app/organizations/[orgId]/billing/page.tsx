"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { organizationsAPI, authAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import { useToast } from "@/components/ToastContainer";
import { useRouter } from "next/navigation";
import { Zap, Activity, Database, ShieldCheck, CheckCircle2, BarChart3 } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

export default function BillingPage() {
  const { orgId } = useOrgProjectParams();
  const toast = useToast();
  const router = useRouter();
  const [fallbackUsage, setFallbackUsage] = useState<{
    plan_type?: string;
    display_plan_type?: string;
    subscription_status?: string;
    entitlement_status?: string;
    current_period_start?: string | null;
    current_period_end?: string | null;
    next_reset_at?: string | null;
    usage_window_type?: string | null;
    limits?: Record<string, number>;
    usage_current_period?: Record<string, number>;
    usage_this_month?: Record<string, number>;
  } | null>(null);

  const { data: org, isValidating } = useSWR(
    orgId ? orgKeys.detail(orgId) : null,
    async () => {
      try {
        return await organizationsAPI.get(orgId, { includeStats: true });
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 404) {
          toast.showToast("This organization has been archived or deleted.", "info");
          router.replace("/organizations");
          return null;
        }
        throw error;
      }
    }
  );

  const { data: myUsage } = useSWR("my-usage", () => authAPI.getMyUsage(), {
    revalidateOnFocus: false,
  });
  useEffect(() => {
    if (myUsage) return;

    const backendBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${backendBase}/api/v1/auth/me/usage`, {
      credentials: "include",
    })
      .then(async res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(payload => {
        if (payload && typeof payload === "object") {
          setFallbackUsage(payload);
        }
      })
      .catch(() => {
        // keep existing UI fallback behavior when usage API is unavailable
      });
  }, [myUsage]);

  const effectiveUsage = myUsage || fallbackUsage;

  const currentPlanId = String(
    effectiveUsage?.display_plan_type || effectiveUsage?.plan_type || org?.plan || "free"
  ).toLowerCase();
  const subscriptionStatus = String(effectiveUsage?.subscription_status || "active").toLowerCase();
  const entitlementStatus = String(effectiveUsage?.entitlement_status || "active").toLowerCase();
  const currentPeriodStart = effectiveUsage?.current_period_start || null;
  const currentPeriodEnd = effectiveUsage?.current_period_end || null;
  const nextResetAt = effectiveUsage?.next_reset_at || currentPeriodEnd || null;
  const usageWindowType = effectiveUsage?.usage_window_type || null;
  const usage = effectiveUsage?.usage_current_period || effectiveUsage?.usage_this_month || {};
  const formatDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString() : "Unknown";
  const usagePeriodLabel =
    currentPeriodStart && currentPeriodEnd
      ? `${formatDate(currentPeriodStart)} - ${formatDate(currentPeriodEnd)}`
      : "Current usage period";
  const resetRuleLabel =
    usageWindowType === "anniversary_monthly"
      ? "Free usage resets monthly from the account start date."
      : usageWindowType === "billing_period"
        ? "Usage resets each billing cycle."
        : "Usage resets each calendar month (UTC).";

  // Org-scoped usage view – limits come from account-level plan;
  // we only need light defaults here for visualization.
  const usageLimits = {
    free: {
      calls: 10000,
      snapshots: 10_000,
      projects: 2,
      platformReplayCredits: 60,
      teamMembers: 3,
    },
    starter: {
      calls: 50_000,
      snapshots: 50_000,
      projects: 8,
      platformReplayCredits: 600,
      teamMembers: 5,
    },
    pro: {
      calls: 200000,
      snapshots: 200_000,
      projects: 30,
      platformReplayCredits: 3_000,
      teamMembers: 5,
    },
    enterprise: {
      calls: -1,
      snapshots: -1,
      projects: -1,
      platformReplayCredits: -1,
      teamMembers: -1,
    },
  };

  const limitData = usageLimits[currentPlanId as keyof typeof usageLimits] || usageLimits.free;

  const monthlyCallsUsedRaw = usage.api_calls;
  const hasMonthlyCalls = typeof monthlyCallsUsedRaw === "number";
  const callsUsed = hasMonthlyCalls ? Number(monthlyCallsUsedRaw) : (org?.calls7d || 0);
  const callsLimit =
    (effectiveUsage?.limits?.api_calls_per_month as number | undefined) ?? limitData.calls;
  const projectsUsed = org?.projects || 0;
  const platformReplayCreditsUsed =
    usage.release_gate_attempts ??
    usage.platform_replay_credits ??
    usage.guard_credits ??
    0;
  const platformReplayCreditsLimit =
    (effectiveUsage?.limits?.release_gate_attempts_per_month as number | undefined) ??
    (effectiveUsage?.limits?.platform_replay_credits_per_month as number | undefined) ??
    (effectiveUsage?.limits?.guard_credits_per_month as number | undefined) ??
    limitData.platformReplayCredits;
  const snapshotsUsed = usage.snapshots ?? 0;
  const snapshotsLimit =
    (effectiveUsage?.limits?.snapshots_per_month as number | undefined) ?? limitData.snapshots;
  const snapshotsExhausted = snapshotsLimit > 0 && snapshotsUsed >= snapshotsLimit;
  const replayExhausted =
    platformReplayCreditsLimit > 0 && platformReplayCreditsUsed >= platformReplayCreditsLimit;
  const snapshotsNearLimit =
    snapshotsLimit > 0 && !snapshotsExhausted && (snapshotsUsed / snapshotsLimit) * 100 >= 80;
  const replayNearLimit =
    platformReplayCreditsLimit > 0 &&
    !replayExhausted &&
    (platformReplayCreditsUsed / platformReplayCreditsLimit) * 100 >= 80;

  const callsPercent =
    hasMonthlyCalls && callsLimit > 0 ? Math.min(100, (callsUsed / callsLimit) * 100) : 0;
  const projectsPercent =
    limitData.projects > 0 ? Math.min(100, (projectsUsed / limitData.projects) * 100) : 0;
  const platformReplayCreditsPercent =
    platformReplayCreditsLimit > 0
      ? Math.min(100, (platformReplayCreditsUsed / platformReplayCreditsLimit) * 100)
      : 0;
  const orgAny = org as any;
  const teamMembersUsedRaw =
    orgAny?.member_count ?? orgAny?.memberCount ?? orgAny?.members_count ?? orgAny?.membersCount;
  const teamMembersUsed = typeof teamMembersUsedRaw === "number" ? teamMembersUsedRaw : null;

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "/month",
      desc: "For teams getting started with Live View and Release Gate during the MVP.",
      features: [
        "1 organization",
        "2 active projects",
        "10,000 snapshots per month",
        "60 replay attempts per month",
      ],
      current: currentPlanId === "free",
    },
    {
      id: "starter",
      name: "Starter",
      price: "$49",
      period: "/month",
      desc: "For teams scaling validation volume with predictable monthly limits.",
      features: [
        "3 organizations",
        "8 active projects",
        "50,000 snapshots per month",
        "600 replay attempts per month",
      ],
      current: currentPlanId === "starter",
    },
    {
      id: "pro",
      name: "Pro",
      price: "$129",
      period: "/month",
      desc: "For teams running higher-throughput validation and release workflows.",
      features: [
        "10 organizations",
        "30 active projects",
        "200,000 snapshots per month",
        "3,000 replay attempts per month",
      ],
      current: currentPlanId === "pro",
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom",
      period: "",
      desc: "For teams that need custom limits, procurement, and deployment controls.",
      features: [
        "Custom replay attempt budget",
        "Custom limits, SLAs, and retention",
        "Dedicated support",
        "Security review and deployment options",
        "SSO / SAML",
      ],
      current: false,
    },
  ];

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: "Organizations", href: "/organizations" },
        { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
        { label: "Settings", href: `/organizations/${orgId}/settings` },
        { label: "Usage & Licensing" },
      ]}
    >
      <div className="max-w-6xl mx-auto pb-24 relative">
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="mb-12 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)] animate-pulse" />
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">
              Usage Policy
            </p>
          </div>
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-4">
            Organization Usage
          </h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm max-w-2xl leading-relaxed">
              View usage for this organization&apos;s projects. For account-wide quotas and billing, use the Account Usage and Billing pages.
            </p>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mt-4 max-w-2xl leading-relaxed">
            Release Gate usage is counted by replay attempt: selected logs x repeats.
          </p>
          <div className="mt-4 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-slate-300">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white">Current usage period</p>
            <p className="mt-2 text-sm font-semibold text-white">{usagePeriodLabel}</p>
            <p className="mt-1 text-slate-400">{resetRuleLabel}</p>
            {nextResetAt ? (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Next reset: {formatDate(nextResetAt)}
              </p>
            ) : null}
          </div>
          {(entitlementStatus === "active_until_period_end" || subscriptionStatus === "cancelled") &&
            currentPeriodEnd && (
              <div className="mt-4 max-w-3xl rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-sky-200">
                  Account subscription ending
                </p>
                <p className="mt-1 text-xs text-white/90">
                  Account-level {currentPlanId} access remains active until{" "}
                  {new Date(currentPeriodEnd).toLocaleDateString()}.
                </p>
              </div>
            )}
          {(snapshotsExhausted || replayExhausted || snapshotsNearLimit || replayNearLimit) && (
            <div
              className={clsx(
                "mt-4 rounded-2xl p-4 max-w-3xl",
                snapshotsExhausted || replayExhausted
                  ? "border border-rose-500/30 bg-rose-500/10"
                  : "border border-amber-500/30 bg-amber-500/10"
              )}
            >
              <p
                className={clsx(
                  "text-[11px] font-bold uppercase tracking-widest",
                  snapshotsExhausted || replayExhausted ? "text-rose-200" : "text-amber-200"
                )}
              >
                {snapshotsExhausted || replayExhausted ? "Plan quota exhausted" : "Plan quota warning"}
              </p>
              <p className="mt-1 text-xs text-white/90">
                {snapshotsExhausted || replayExhausted
                  ? snapshotsExhausted && replayExhausted
                    ? `Snapshots (${snapshotsUsed}/${snapshotsLimit}) and replay attempts (${platformReplayCreditsUsed}/${platformReplayCreditsLimit}) are exhausted.`
                    : snapshotsExhausted
                      ? `Snapshots are exhausted (${snapshotsUsed}/${snapshotsLimit}).`
                      : `Replay attempts are exhausted (${platformReplayCreditsUsed}/${platformReplayCreditsLimit}).`
                  : snapshotsNearLimit && replayNearLimit
                    ? `Snapshots (${snapshotsUsed}/${snapshotsLimit}) and replay attempts (${platformReplayCreditsUsed}/${platformReplayCreditsLimit}) are above 80%.`
                    : snapshotsNearLimit
                      ? `Snapshots are above 80% (${snapshotsUsed}/${snapshotsLimit}).`
                      : `Replay attempts are above 80% (${platformReplayCreditsUsed}/${platformReplayCreditsLimit}).`}{" "}
                Reduce selected logs or repeats, or upgrade in account billing.
              </p>
              <Link
                href="/settings/billing"
                className="mt-3 inline-flex rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20"
              >
                Open account billing
              </Link>
            </div>
          )}
        </div>

        {/* Telemetry Runway (Usage Summary) */}
        <div className="mb-16">
          <h2 className="text-xl font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            Current Telemetry Runway
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            {/* Validation Usage Card */}
            <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 relative overflow-hidden group">
              <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

              <div className="flex items-start justify-between mb-8 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">
                      Validations Executed
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                      {hasMonthlyCalls ? "Rolling 30-Day Limit" : "Recent 7-Day Activity"}
                    </p>
                  </div>
                </div>
                {isValidating ? (
                  <div className="w-20 h-6 bg-white/5 rounded animate-pulse" />
                ) : (
                  <div className="text-right">
                    <span className="text-2xl font-black text-white">
                      {callsUsed.toLocaleString()}
                    </span>
                    {callsLimit > 0 ? (
                      <span className="text-slate-500 text-sm font-bold ml-1">
                        / {callsLimit.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest ml-2 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                        Unlimited
                      </span>
                    )}
                  </div>
                )}
              </div>

              {hasMonthlyCalls && callsLimit > 0 && (
                <div className="relative z-10">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    <span>Quota Used: {callsPercent.toFixed(1)}%</span>
                    <span className={callsPercent > 80 ? "text-amber-400" : ""}>
                      {Math.max(0, callsLimit - callsUsed)} Remaining
                    </span>
                  </div>
                  <div className="h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
                    <div
                      className="h-full bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.6)] relative overflow-hidden transition-all duration-1000"
                      style={{ width: `${callsPercent}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Protocol Usage Card */}
            <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 relative overflow-hidden">
              <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />
              <div className="flex items-start justify-between mb-8 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">
                      Active Protocols
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                      Concurrently Running Projects
                    </p>
                  </div>
                </div>
                {isValidating ? (
                  <div className="w-12 h-6 bg-white/5 rounded animate-pulse" />
                ) : (
                  <div className="text-right">
                    <span className="text-2xl font-black text-white">{projectsUsed}</span>
                    {limitData.projects > 0 ? (
                      <span className="text-slate-500 text-sm font-bold ml-1">
                        / {limitData.projects}
                      </span>
                    ) : (
                      <span className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest ml-2 bg-indigo-500/10 px-2 py-1 rounded-full border border-indigo-500/20">
                        Unlimited
                      </span>
                    )}
                  </div>
                )}
              </div>

              {limitData.projects > 0 && (
                <div className="relative z-10">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    <span>Seat Usage: {projectsPercent.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
                    <div
                      className="h-full bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.6)] transition-all duration-1000"
                      style={{ width: `${projectsPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Usage Overview (API / Projects / Cost) */}
        <div className="mb-16">
          <h2 className="text-xl font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Usage Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-5 w-5 text-blue-400" />
                <span className="text-sm text-slate-400">
                  API Calls {hasMonthlyCalls ? "(month)" : "(7d)"}
                </span>
              </div>
              <div className="text-3xl font-bold text-white">{callsUsed.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="text-sm text-slate-400">Projects</span>
              </div>
              <div className="text-3xl font-bold text-white">{projectsUsed}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-cyan-400" />
                <span className="text-sm text-slate-400">Release Gate Usage</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {platformReplayCreditsUsed.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Plan Limits */}
        <div className="mb-16 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-semibold text-white">Plan Limits</h2>
            {currentPlanId === "free" && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                Free plan
              </span>
            )}
          </div>
          <div className="space-y-6">
            {snapshotsLimit != null && snapshotsLimit > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Snapshots this month</span>
                    <span className="text-white">
                      {snapshotsUsed} / {snapshotsLimit}
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all",
                        snapshotsExhausted
                          ? "bg-rose-500"
                          : snapshotsNearLimit
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      )}
                      style={{
                        width: `${Math.min(
                          100,
                          (snapshotsUsed / snapshotsLimit) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            {platformReplayCreditsLimit != null && platformReplayCreditsLimit > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">Platform replay credits this month</span>
                  <span className="text-white">
                    {platformReplayCreditsUsed.toLocaleString()} /{" "}
                    {platformReplayCreditsLimit.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all",
                      replayExhausted
                        ? "bg-rose-500"
                        : replayNearLimit
                          ? "bg-amber-500"
                          : "bg-cyan-500"
                    )}
                    style={{
                      width: `${platformReplayCreditsPercent}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Usage is counted by replay attempt: selected logs x repeats.
                </p>
              </div>
            )}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">API Calls</span>
                <span className="text-white">
                  {callsUsed.toLocaleString()}{" "}
                  {hasMonthlyCalls && callsLimit > 0 ? `/ ${callsLimit.toLocaleString()}` : ""}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${hasMonthlyCalls ? Math.min(callsPercent, 100) : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Projects</span>
                <span className="text-white">
                  {projectsUsed}
                  {limitData.projects > 0 ? ` / ${limitData.projects}` : ""}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(projectsPercent, 100)}%` }}
                />
              </div>
            </div>
            {/* Team members limit is currently fixed in UI; can be wired to real data later */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Team Members</span>
                <span className="text-white">
                  {teamMembersUsed == null ? "N/A" : teamMembersUsed}
                  {limitData.teamMembers > 0 ? ` / ${limitData.teamMembers}` : ""}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{
                    width: `${limitData.teamMembers > 0 && teamMembersUsed != null ? Math.min(100, (teamMembersUsed / limitData.teamMembers) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Protection Tiers (Plans) */}
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Infrastructure Licenses
          </h2>

          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">
            Quotas shown here follow account plan limits. Upgrade is managed in Account Billing.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 xl:gap-7 items-stretch">
            {plans.map(plan => {
              const isCurrent = plan.current;

              return (
                <div
                  key={plan.id}
                  className={`relative w-full rounded-[32px] px-6 py-7 xl:px-7 xl:py-8 min-h-[440px] transition-all duration-300 group
                    ${isCurrent ? "bg-[#0a0f12] border-2 border-emerald-500/40 shadow-[0_0_36px_-14px_rgba(16,185,129,0.3)]" : "bg-white/[0.02] border border-white/10 backdrop-blur-3xl hover:bg-white/[0.04]"}
                  `}
                >
                  {!isCurrent && (
                    <div className="absolute top-6 right-6 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Account Managed
                      </span>
                    </div>
                  )}

                  {/* Active Indicator inside card */}
                  {isCurrent && (
                    <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                        Active License
                      </span>
                    </div>
                  )}

                  <div className="relative z-10">
                    <h3
                      className={`text-[26px] leading-none font-black uppercase tracking-tight mb-2 ${isCurrent ? "text-white" : "text-slate-300"}`}
                    >
                      {plan.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest leading-5 min-h-[54px] mb-5 pr-10">
                      {plan.desc}
                    </p>

                    <div className="flex items-baseline gap-1.5 mb-6 pb-6 border-b border-white/10">
                      <span
                        className={`text-[34px] font-black tracking-tight leading-none ${isCurrent ? "text-emerald-400" : "text-white"}`}
                      >
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                          {plan.period}
                        </span>
                      )}
                    </div>

                    <ul className="space-y-2.5 mb-8">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <div
                            className={`mt-[2px] w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isCurrent ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-400"}`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                          </div>
                          <span
                            className={`${isCurrent ? "text-slate-200" : "text-slate-400"} text-[11px] leading-[1.45] font-semibold tracking-wide flex-1`}
                          >
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <button
                      disabled={true}
                      className={`w-full h-12 rounded-xl flex items-center justify-center text-[11px] font-black uppercase tracking-widest transition-all duration-300
                        ${
                          isCurrent
                            ? "bg-white/5 text-slate-500 cursor-not-allowed border border-white/5"
                            : "bg-white/10 text-slate-500 cursor-not-allowed border border-white/10"
                        }
                      `}
                    >
                      {isCurrent ? "Current Plan" : "Manage in Account Billing"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
