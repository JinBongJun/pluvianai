"use client";

import AccountLayout from "@/components/layout/AccountLayout";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import useSWR from "swr";
import { apiClient } from "@/lib/api/client";
import { billingAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { useState } from "react";

type UsageResponse = {
  plan_type: string;
};

export default function AccountBillingPage() {
  const hasToken = useRequireAuth();
  const toast = useToast();
  const [upgradeBusy, setUpgradeBusy] = useState<string | null>(null);
  const { data } = useSWR<UsageResponse>(
    hasToken ? "/auth/me/usage" : null,
    async () => {
      const res = await apiClient.get("/auth/me/usage");
      return res.data as UsageResponse;
    }
  );

  const currentPlanId = (data?.plan_type || "free").toLowerCase();

  const startUpgrade = async (planType: string) => {
    if (!hasToken || upgradeBusy) return;
    setUpgradeBusy(planType);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const successUrl = `${origin}/settings/billing?checkout=success`;
      const cancelUrl = `${origin}/settings/billing?checkout=cancel`;
      const session = await billingAPI.createCheckoutSession(planType, successUrl, cancelUrl);
      if (!session?.url) throw new Error("Missing checkout URL");
      window.location.href = session.url;
    } catch (err: any) {
      const apiError = err?.response?.data?.error;
      const detail = err?.response?.data?.detail;
      const msg =
        (typeof apiError?.message === "string" ? apiError.message : null) ||
        (typeof detail === "string" ? detail : detail?.message) ||
        err?.message ||
        "Failed to start checkout";
      toast.showToast(msg, "error");
    } finally {
      setUpgradeBusy(null);
    }
  };

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
          <br />
          Subscriptions auto-renew unless canceled before the next billing cycle.
        </p>
        <div className="mb-8 text-xs text-slate-400 space-y-1">
          <p>
            By upgrading, you agree to our{" "}
            <a href="/trust" className="text-emerald-300 hover:text-emerald-200 underline">
              Terms and Privacy
            </a>
            {" "}and refund/cancellation policy.
          </p>
          <p>
            Need to cancel or billing help? Contact support via{" "}
            <a href="/settings/profile" className="text-emerald-300 hover:text-emerald-200 underline">
              account settings
            </a>
            .
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {plans.map(plan => {
            const isCurrent = plan.id === currentPlanId;
            const canCheckout = plan.id === "pro";
            const isContactSales = plan.id === "enterprise";
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
                      {plan.id === "free" ? "Active License" : isContactSales ? "Contact Sales" : "Paid Plan"}
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
                  ) : canCheckout ? (
                    <button
                      onClick={() => void startUpgrade(plan.id)}
                      disabled={upgradeBusy !== null}
                      className="w-full py-2.5 rounded-xl border border-emerald-500/60 bg-emerald-500 text-[11px] font-bold uppercase tracking-widest text-black hover:bg-emerald-400 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {upgradeBusy === plan.id ? "Opening checkout..." : "Upgrade"}
                    </button>
                  ) : isContactSales ? (
                    <a
                      href="mailto:support@pluvianai.com?subject=Enterprise%20Plan%20Inquiry"
                      className="w-full inline-flex items-center justify-center py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                    >
                      Contact Sales
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold uppercase tracking-widest text-emerald-300 cursor-default"
                    >
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

