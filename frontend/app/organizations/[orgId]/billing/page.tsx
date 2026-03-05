"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { organizationsAPI, authAPI } from "@/lib/api";
import { CreditCard, Zap, Activity, Database, ShieldCheck, CheckCircle2, BarChart3, TrendingUp } from "lucide-react";

export default function BillingPage() {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const { data: org, isValidating } = useSWR(orgId ? ["organization", orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: true })
  );

  const { data: myUsage } = useSWR("my-usage", () => authAPI.getMyUsage(), { revalidateOnFocus: false });

  const currentPlanId = org?.plan || "free";

  // Mock limits if not returned by backend
  const usageLimits = {
    free: { calls: 10000, projects: 3 },
    pro: { calls: 100000, projects: -1 }, // -1 implies unlimited
    enterprise: { calls: -1, projects: -1 },
  };

  const limitData = usageLimits[currentPlanId as keyof typeof usageLimits] || usageLimits.free;

  const callsUsed = org?.calls7d || 0; // Ideally backend should provide monthly usage, defaulting to 7d for demo
  const projectsUsed = org?.projects || 0;

  const callsPercent = limitData.calls > 0 ? Math.min(100, (callsUsed / limitData.calls) * 100) : 0;
  const projectsPercent =
    limitData.projects > 0 ? Math.min(100, (projectsUsed / limitData.projects) * 100) : 0;

  const plans = [
    {
      id: "free",
      name: "Laboratory Basics",
      price: "$0",
      period: "/month",
      desc: "For individual researchers and hobbyists.",
      features: [
        "Up to 3 Active Protocols",
        "10,000 Validations/mo",
        "7-day Telemetry Retention",
        "Standard Encryption",
      ],
      current: currentPlanId === "free",
    },
    {
      id: "pro",
      name: "Clinical Operations",
      price: "$49",
      period: "/month",
      desc: "For professional teams pushing models to production.",
      features: [
        "Unlimited Protocols",
        "100,000 Validations/mo",
        "30-day Telemetry Retention",
        "Priority Defense Updates",
        "Advanced Agentic Analytics",
      ],
      current: false,
      popular: true,
    },
    {
      id: "enterprise",
      name: "Enterprise Defense",
      price: "Custom",
      period: "",
      desc: "For mission-critical AI infrastructure.",
      features: [
        "Unlimited Everything",
        "Custom Validation Thresholds",
        "90-day Telemetry Retention",
        "Dedicated Cyber-Analyst",
        "SLA Guarantee (99.99%)",
        "SSO / SAML Security",
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
              Resource Allocation
            </p>
          </div>
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-4">
            Usage & Licensing
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm max-w-2xl leading-relaxed">
            Monitor your clinical activity, manage billing, and scale your PluvianAI infrastructure
            to meet compliance.
          </p>
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
                      Rolling 30-Day Limit
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
                    {limitData.calls > 0 ? (
                      <span className="text-slate-500 text-sm font-bold ml-1">
                        / {limitData.calls.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest ml-2 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                        Unlimited
                      </span>
                    )}
                  </div>
                )}
              </div>

              {limitData.calls > 0 && (
                <div className="relative z-10">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    <span>Quota Used: {callsPercent.toFixed(1)}%</span>
                    <span className={callsPercent > 80 ? "text-amber-400" : ""}>
                      {limitData.calls - callsUsed} Remaining
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
                <span className="text-sm text-slate-400">API Calls (7d)</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {callsUsed.toLocaleString()}
              </div>
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
                <TrendingUp className="h-5 w-5 text-green-400" />
                <span className="text-sm text-slate-400">Total Cost (7d)</span>
              </div>
              <div className="text-3xl font-bold text-white">
                ${org?.cost7d?.toFixed(2) || "0.00"}
              </div>
            </div>
          </div>
        </div>

        {/* Plan Limits */}
        <div className="mb-16 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-semibold text-white">Plan Limits</h2>
            {myUsage?.plan_type === "free" && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                Free plan
              </span>
            )}
          </div>
          <div className="space-y-6">
            {typeof myUsage?.usage_this_month?.snapshots === "number" &&
              myUsage?.limits?.snapshots_per_month != null &&
              myUsage.limits.snapshots_per_month > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Snapshots this month</span>
                    <span className="text-white">
                      {myUsage.usage_this_month.snapshots} / {myUsage.limits.snapshots_per_month}
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (myUsage.usage_this_month.snapshots / myUsage.limits.snapshots_per_month) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            {typeof myUsage?.usage_this_month?.guard_credits === "number" &&
              myUsage?.limits?.guard_credits_per_month != null &&
              myUsage.limits.guard_credits_per_month > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">GuardCredits this month</span>
                    <span className="text-white">
                      {myUsage.usage_this_month.guard_credits.toLocaleString()} /{" "}
                      {myUsage.limits.guard_credits_per_month.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (myUsage.usage_this_month.guard_credits / myUsage.limits.guard_credits_per_month) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">API Calls</span>
                <span className="text-white">
                  {callsUsed.toLocaleString()}{" "}
                  {limitData.calls > 0 ? `/ ${limitData.calls.toLocaleString()}` : ""}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(callsPercent, 100)}%` }}
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
                <span className="text-white">1 / 3</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: "33%" }}
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
            During the MVP, only the free Community plan is available. Paid plans are read-only previews.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {plans.map((plan, index) => {
              const isPro = plan.id === "pro";
              const isCurrent = plan.current;

              return (
                <div
                  key={plan.id}
                  className={`relative w-full rounded-[40px] p-10 transition-all duration-300 group
                    ${isPro ? "bg-[#0a0f12] border-2 border-emerald-500/40 shadow-[0_0_50px_-15px_rgba(16,185,129,0.3)] z-10 scale-[1.02] lg:-mx-2 py-14" : "bg-white/[0.02] border border-white/10 backdrop-blur-3xl hover:bg-white/[0.04]"}
                  `}
                >
                  {/* Pro specific effects */}
                  {isPro && (
                    <>
                      {/* Glow Behind */}
                      <div className="absolute inset-0 bg-emerald-500/5 blur-3xl rounded-[40px] -z-10" />
                      {/* Popular Badge */}
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-emerald-500 rounded-full flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.5)] z-20">
                        <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                        <span className="text-[10px] font-black text-black uppercase tracking-[0.2em] whitespace-nowrap">
                          Standard Recommendation
                        </span>
                      </div>
                    </>
                  )}

                  {/* Active Indicator inside card */}
                  {isCurrent && (
                    <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                        Active License
                      </span>
                    </div>
                  )}

                  <div className="relative z-10">
                    <h3
                      className={`text-2xl font-black uppercase tracking-tighter mb-2 ${isPro ? "text-white" : "text-slate-300"}`}
                    >
                      {plan.name}
                    </h3>
                    <p className="text-sm text-slate-500 font-bold uppercase tracking-widest leading-relaxed min-h-[40px] mb-8 pr-12">
                      {plan.desc}
                    </p>

                    <div className="flex items-baseline gap-2 mb-10 pb-10 border-b border-white/10">
                      <span
                        className={`text-6xl font-black tracking-tighter ${isPro ? "text-emerald-400" : "text-white"}`}
                      >
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                          {plan.period}
                        </span>
                      )}
                    </div>

                    <ul className="space-y-5 mb-12">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-4">
                          <div
                            className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isPro ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-400"}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <span
                            className={`${isPro ? "text-slate-200" : "text-slate-400"} text-sm font-semibold tracking-wide flex-1`}
                          >
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <button
                      disabled={true}
                      className={`w-full h-14 rounded-2xl flex items-center justify-center text-sm font-black uppercase tracking-widest transition-all duration-300
                        ${
                          isCurrent
                            ? "bg-white/5 text-slate-500 cursor-not-allowed border border-white/5"
                            : "bg-white/10 text-slate-500 cursor-not-allowed border border-white/10"
                        }
                      `}
                    >
                      {isCurrent ? "Current License" : "Coming Soon"}
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
