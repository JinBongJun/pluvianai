"use client";

import AccountLayout from "@/components/layout/AccountLayout";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import useSWR from "swr";
import { apiClient } from "@/lib/api/client";

type UsageResponse = {
  plan_type: string;
};

export default function AccountBillingPage() {
  const hasToken = useRequireAuth();
  const { data } = useSWR<UsageResponse>(
    hasToken ? "/auth/me/usage" : null,
    async () => {
      const res = await apiClient.get("/auth/me/usage");
      return res.data as UsageResponse;
    }
  );

  const currentPlanId = (data?.plan_type || "free").toLowerCase();

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
        "60 hosted replay credits per month",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      price: "$49",
      period: "/month",
      desc: "For teams that need higher hosted replay budgets and multi-project scale.",
      features: [
        "5 organizations",
        "10 active projects",
        "30,000 snapshots per month",
        "800 hosted replay credits per month",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom",
      period: "",
      desc: "For teams that need custom limits, procurement, and deployment controls.",
      features: [
        "Custom hosted replay budget",
        "Custom limits, SLAs, and retention",
        "Dedicated support",
        "Security review and deployment options",
        "SSO / SAML",
      ],
    },
  ];

  return (
    <AccountLayout
      activeTab="billing"
      breadcrumb={[
        { label: "Account", href: "/settings/profile" },
        { label: "Billing" },
      ]}
    >
      <div className="pb-24 relative">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-8 max-w-2xl leading-relaxed">
          All plans include 30-day trace retention.
          <br />
          BYOK runs do not consume hosted replay credits.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {plans.map(plan => {
            const isCurrent = plan.id === currentPlanId;
            const isComingSoon = plan.id !== "free";
            return (
              <div
                key={plan.id}
                className={`rounded-[32px] border bg-white/[0.02] backdrop-blur-xl p-6 flex flex-col justify-between ${
                  plan.id === "pro"
                    ? "border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.25)]"
                    : "border-white/10"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                      {plan.id === "free" ? "Active License" : "Coming Soon"}
                    </div>
                    {isCurrent && (
                      <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                        Current Plan
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-1">
                    {plan.name}
                  </h2>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-black text-white">{plan.price}</span>
                    {plan.period && (
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-widest mb-4">
                    {plan.desc}
                  </p>
                  <ul className="space-y-1.5 text-[11px] text-slate-300">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold uppercase tracking-widest text-emerald-300 cursor-default"
                    >
                      Current Plan
                    </button>
                  ) : isComingSoon ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl border border-slate-600/60 bg-slate-900/60 text-[11px] font-bold uppercase tracking-widest text-slate-400 cursor-not-allowed"
                    >
                      Preview Only
                    </button>
                  ) : (
                    <button className="w-full py-2.5 rounded-xl border border-emerald-500/60 bg-emerald-500 text-[11px] font-bold uppercase tracking-widest text-black hover:bg-emerald-400 transition-colors">
                      Stay on Free
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AccountLayout>
  );
}

