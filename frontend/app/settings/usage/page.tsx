"use client";

import useSWR from "swr";
import AccountLayout from "@/components/layout/AccountLayout";
import { apiClient } from "@/lib/api/client";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { BarChart3, Zap, Building2 } from "lucide-react";

type UsageResponse = {
  plan_type: string;
  limits: Record<string, unknown>;
  usage_this_month: {
    snapshots?: number;
    guard_credits?: number;
    platform_replay_credits?: number;
    api_calls?: number;
    projects_used?: number;
    organizations_used?: number;
    api_calls_limit?: number | null;
  };
};

/** When API limits are missing, match Phase 0 product defaults (subscription_limits.py). */
const FALLBACK_BY_PLAN: Record<string, { projects: number; organizations: number; replay: number }> = {
  free: { projects: 2, organizations: 1, replay: 60 },
  pro: { projects: 10, organizations: 5, replay: 800 },
  enterprise: { projects: -1, organizations: -1, replay: -1 },
};

const asNumber = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function AccountUsagePage() {
  const hasToken = useRequireAuth();

  const { data, isLoading } = useSWR<UsageResponse>(
    hasToken ? "/auth/me/usage" : null,
    async () => {
      const res = await apiClient.get("/auth/me/usage");
      return res.data as UsageResponse;
    }
  );

  const planType = (data?.plan_type || "free").toLowerCase();
  const limits = data?.limits || {};
  const usage = data?.usage_this_month || {};
  const fb = FALLBACK_BY_PLAN[planType] ?? FALLBACK_BY_PLAN.free;

  const snapshotsUsed = usage.snapshots ?? 0;
  const snapshotsLimit = asNumber(
    (limits as any).snapshots_per_month,
    asNumber((limits as any).api_calls_per_month, 10000)
  );

  const apiCallsUsed = usage.api_calls ?? 0;
  const apiCallsLimit = usage.api_calls_limit ?? asNumber((limits as any).api_calls_per_month, 10000);

  const projectsUsed = usage.projects_used ?? 0;
  const projectsLimit = asNumber((limits as any).projects, fb.projects);

  const organizationsUsed = usage.organizations_used ?? 0;
  const organizationsLimit = asNumber((limits as any).organizations, fb.organizations);

  const replayUsed = usage.platform_replay_credits ?? usage.guard_credits ?? 0;
  const replayLimit = asNumber(
    (limits as any).platform_replay_credits_per_month ?? (limits as any).guard_credits_per_month,
    fb.replay
  );

  const pct = (used: number, limit: number) =>
    limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

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
          All plans include 30-day trace retention.
          <br />
          BYOK runs do not consume hosted replay credits.
        </p>

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
                    className="h-full bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.6)] transition-all duration-1000"
                    style={{ width: `${pct(snapshotsUsed, snapshotsLimit)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Hosted Replay Credits */}
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />
            <div className="flex items-start justify-between mb-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">
                    Hosted replay credits
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                    Release Gate &amp; Replay hosted runs
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
                    className="h-full bg-sky-400 rounded-full shadow-[0_0_15px_rgba(56,189,248,0.6)] transition-all duration-1000"
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

