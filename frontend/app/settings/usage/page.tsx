"use client";

import useSWR from "swr";
import AccountLayout from "@/components/layout/AccountLayout";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { authAPI } from "@/lib/api/auth";
import {
  ACCOUNT_USAGE_FALLBACK_BY_PLAN,
  ACCOUNT_USAGE_SWR_KEY,
  accountUsageAsNumber,
  computeAccountUsageMetrics,
  usageQuotaPercent,
} from "@/lib/accountUsage";
import { BarChart3, Zap, Building2 } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

export default function AccountUsagePage() {
  const hasToken = useRequireAuth();

  const { data, isLoading } = useSWR(
    hasToken ? ACCOUNT_USAGE_SWR_KEY : null,
    () => authAPI.getMyUsage()
  );

  const planType = (data?.display_plan_type || data?.plan_type || "free").toLowerCase();
  const subscriptionStatus = String(data?.subscription_status || "active").toLowerCase();
  const entitlementStatus = String(data?.entitlement_status || "active").toLowerCase();
  const currentPeriodEnd = data?.current_period_end || data?.entitlement_effective_to || null;
  const limits = data?.limits || {};
  const usage = (data?.usage_this_month || {}) as Record<string, unknown>;
  const fb = ACCOUNT_USAGE_FALLBACK_BY_PLAN[planType] ?? ACCOUNT_USAGE_FALLBACK_BY_PLAN.free;

  const metrics = computeAccountUsageMetrics(data);
  const snapshotsUsed = metrics?.snapshotsUsed ?? 0;
  const snapshotsLimit = metrics?.snapshotsLimit ?? 0;
  const replayUsed = metrics?.replayUsed ?? 0;
  const replayLimit = metrics?.replayLimit ?? 0;
  const snapshotsExhausted = metrics?.snapshotsExhausted ?? false;
  const replayExhausted = metrics?.replayExhausted ?? false;
  const snapshotsNearLimit = metrics?.snapshotsNearLimit ?? false;
  const replayNearLimit = metrics?.replayNearLimit ?? false;

  const apiCallsUsed = accountUsageAsNumber(usage.api_calls, 0);
  const apiCallsLimit = accountUsageAsNumber(
    usage.api_calls_limit ?? (limits as Record<string, unknown>).api_calls_per_month,
    10000
  );

  const projectsUsed = accountUsageAsNumber(usage.projects_used, 0);
  const projectsLimit = accountUsageAsNumber((limits as Record<string, unknown>).projects, fb.projects);

  const organizationsUsed = accountUsageAsNumber(usage.organizations_used, 0);
  const organizationsLimit = accountUsageAsNumber((limits as Record<string, unknown>).organizations, fb.organizations);

  const pct = usageQuotaPercent;

  return (
    <AccountLayout
      activeTab="usage"
      breadcrumb={[
        { label: "Account", href: "/settings/profile" },
        { label: "Usage" },
      ]}
    >
      <div className="pb-24 relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-8 max-w-2xl leading-relaxed relative z-10">
          Release Gate usage is counted by replay attempt: selected logs x repeats.
        </p>
        {(entitlementStatus === "active_until_period_end" || subscriptionStatus === "cancelled") && currentPeriodEnd && (
          <div className="mb-8 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-200">
              Subscription ending
            </p>
            <p className="mt-1 text-xs text-white/90">
              Your {planType} access stays active until{" "}
              {new Date(currentPeriodEnd).toLocaleDateString()}.
            </p>
          </div>
        )}
        {(snapshotsExhausted || replayExhausted || snapshotsNearLimit || replayNearLimit) && (
          <div
            className={clsx(
              "mb-8 rounded-2xl p-4",
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
                  ? "Snapshots and Release Gate usage are exhausted for this billing period."
                  : snapshotsExhausted
                    ? "Snapshots are exhausted for this billing period."
                    : "Release Gate usage is exhausted for this billing period."
                : snapshotsNearLimit && replayNearLimit
                  ? "Snapshots and Release Gate usage are above 80% usage."
                  : snapshotsNearLimit
                    ? "Snapshots are above 80% usage."
                    : "Release Gate usage is above 80% usage."}
              {" "}Reduce selected logs or repeats, or upgrade plan.
            </p>
            <Link
              href="/settings/billing"
              className="mt-3 inline-flex rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20"
            >
              Open billing
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16 relative z-10">
          {/* Snapshots */}
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />
            <div className="flex items-start justify-between mb-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">
                    Snapshots this month
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                    All projects, current billing period
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-white">
                  {snapshotsUsed.toLocaleString()}
                </span>
                {snapshotsLimit > 0 ? (
                  <span className="text-slate-500 text-sm font-bold ml-1">
                    / {snapshotsLimit.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest ml-2 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                    Unlimited
                  </span>
                )}
              </div>
            </div>
            {snapshotsLimit > 0 && (
              <div className="relative z-10">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  <span>Quota Used: {pct(snapshotsUsed, snapshotsLimit).toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-1000",
                      snapshotsExhausted
                        ? "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]"
                        : snapshotsNearLimit
                          ? "bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]"
                          : "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]"
                    )}
                    style={{ width: `${pct(snapshotsUsed, snapshotsLimit)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Release Gate Usage */}
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />
            <div className="flex items-start justify-between mb-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">
                    Release Gate usage
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                    Replay attempts this billing period
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-white">
                  {replayUsed.toLocaleString()}
                </span>
                {replayLimit > 0 ? (
                  <span className="text-slate-500 text-sm font-bold ml-1">
                    / {replayLimit.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-sky-400 text-[10px] font-bold uppercase tracking-widest ml-2 bg-sky-500/10 px-2 py-1 rounded-full border border-sky-500/20">
                    Unlimited
                  </span>
                )}
              </div>
            </div>
            {replayLimit > 0 && (
              <div className="relative z-10">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  <span>Quota Used: {pct(replayUsed, replayLimit).toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-1000",
                      replayExhausted
                        ? "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]"
                        : replayNearLimit
                          ? "bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]"
                          : "bg-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.6)]"
                    )}
                    style={{ width: `${pct(replayUsed, replayLimit)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* API Calls & Projects */}
        <div className="mb-16">
          <h2 className="text-xl font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Usage Overview
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">
                Api Calls
              </div>
              <div className="text-3xl font-bold text-white">
                {apiCallsUsed.toLocaleString()}
                {apiCallsLimit && apiCallsLimit > 0 ? (
                  <span className="text-slate-500 text-sm font-bold ml-1">
                    / {apiCallsLimit.toLocaleString()}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                Organizations
              </div>
              <div className="text-3xl font-bold text-white">
                {organizationsUsed}
                {organizationsLimit > 0 ? (
                  <span className="text-slate-500 text-sm font-bold ml-1">
                    / {organizationsLimit}
                  </span>
                ) : (
                  <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest ml-2 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                    Unlimited
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">
                Active Projects
              </div>
              <div className="text-3xl font-bold text-white">
                {projectsUsed}
                {projectsLimit > 0 ? (
                  <span className="text-slate-500 text-sm font-bold ml-1">
                    / {projectsLimit}
                  </span>
                ) : (
                  <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest ml-2 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                    Unlimited
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">
                Plan
              </div>
              <div className="text-3xl font-bold text-white capitalize">
                {planType}
              </div>
              {(entitlementStatus === "active_until_period_end" || subscriptionStatus === "cancelled") && (
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-sky-300">
                  Active until period end
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Link to Billing */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-1">
              Manage Plan
            </div>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">
              Adjust your plan, billing details, and invoices in the Billing page.
            </p>
          </div>
          <a
            href="/settings/billing"
            className="inline-flex items-center px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          >
            Go to Billing
          </a>
        </div>
      </div>
    </AccountLayout>
  );
}

