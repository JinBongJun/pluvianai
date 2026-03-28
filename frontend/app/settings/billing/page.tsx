"use client";

import AccountLayout from "@/components/layout/AccountLayout";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { apiClient } from "@/lib/api/client";
import { billingAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  getPaddleCheckoutState,
  stripBillingCheckoutParams,
} from "@/components/billing/paddlePaymentLink";
import { BillingManageSubscriptionCard } from "@/components/billing/BillingManageSubscriptionCard";

type UsageResponse = {
  plan_type: string;
  limits?: {
    snapshots_per_month?: number;
    guard_credits_per_month?: number;
    platform_replay_credits_per_month?: number;
  };
  usage_this_month?: {
    snapshots?: number;
    guard_credits?: number;
    platform_replay_credits?: number;
  };
};

export default function AccountBillingPage() {
  const hasToken = useRequireAuth();
  const toast = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { mutate } = useSWRConfig();
  const [upgradeBusy, setUpgradeBusy] = useState<string | null>(null);
  const { data } = useSWR<UsageResponse>(
    hasToken ? "/auth/me/usage" : null,
    async () => {
      const res = await apiClient.get("/auth/me/usage");
      return res.data as UsageResponse;
    }
  );

  const currentPlanId = (data?.plan_type || "free").toLowerCase();
  const showManageSubscription =
    currentPlanId === "starter" || currentPlanId === "pro";
  const snapshotsUsed = Number(data?.usage_this_month?.snapshots ?? 0);
  const snapshotsLimit = Number(data?.limits?.snapshots_per_month ?? -1);
  const replayUsed = Number(
    data?.usage_this_month?.platform_replay_credits ?? data?.usage_this_month?.guard_credits ?? 0
  );
  const replayLimit = Number(
    data?.limits?.platform_replay_credits_per_month ?? data?.limits?.guard_credits_per_month ?? -1
  );
  const snapshotsExhausted = snapshotsLimit > 0 && snapshotsUsed >= snapshotsLimit;
  const replayExhausted = replayLimit > 0 && replayUsed >= replayLimit;
  const snapshotsNearLimit =
    snapshotsLimit > 0 && !snapshotsExhausted && (snapshotsUsed / snapshotsLimit) * 100 >= 80;
  const replayNearLimit = replayLimit > 0 && !replayExhausted && (replayUsed / replayLimit) * 100 >= 80;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkoutState = getPaddleCheckoutState(new URLSearchParams(search));
    if (!checkoutState) return;

    const refreshBillingState = () =>
      Promise.allSettled([
        mutate("/auth/me/usage"),
        mutate("/billing/usage"),
        mutate("/billing/limits"),
      ]);

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (checkoutState === "success") {
      toast.showToast("Checkout completed. Refreshing billing status...", "success");
      void refreshBillingState();
      timers.push(setTimeout(() => void refreshBillingState(), 1500));
      timers.push(setTimeout(() => void refreshBillingState(), 5000));
    } else {
      toast.showToast("Checkout canceled.", "info");
    }

    const nextUrl = stripBillingCheckoutParams(new URL(window.location.href));
    window.history.replaceState({}, "", nextUrl);

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [mutate, pathname, search, toast]);

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
      id: "starter",
      name: "Starter",
      price: "$49",
      period: "/month",
      desc: "For teams scaling validation volume with predictable monthly limits.",
      features: [
        "3 organizations",
        "8 active projects",
        "50,000 snapshots per month",
        "600 hosted replay credits per month",
      ],
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
        "3,000 hosted replay credits per month",
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
      isWide={true}
      breadcrumb={[
        { label: "Account", href: "/settings/profile" },
        { label: "Billing" },
      ]}
    >
      <div className="pb-24 relative">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-8 leading-relaxed">
          BYOK runs do not consume hosted replay credits.
          <br />
          Subscriptions auto-renew unless canceled before the next billing cycle.
        </p>
        {(snapshotsExhausted || replayExhausted || snapshotsNearLimit || replayNearLimit) && (
          <div
            className={clsx(
              "mb-6 rounded-2xl p-4",
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
                  ? `Snapshots (${snapshotsUsed}/${snapshotsLimit}) and hosted replay credits (${replayUsed}/${replayLimit}) are exhausted.`
                  : snapshotsExhausted
                    ? `Snapshots are exhausted (${snapshotsUsed}/${snapshotsLimit}).`
                    : `Hosted replay credits are exhausted (${replayUsed}/${replayLimit}).`
                : snapshotsNearLimit && replayNearLimit
                  ? `Snapshots (${snapshotsUsed}/${snapshotsLimit}) and hosted replay credits (${replayUsed}/${replayLimit}) are above 80%.`
                  : snapshotsNearLimit
                    ? `Snapshots are above 80% (${snapshotsUsed}/${snapshotsLimit}).`
                    : `Hosted replay credits are above 80% (${replayUsed}/${replayLimit}).`}{" "}
              BYOK is still available where supported.
            </p>
          </div>
        )}
        <div className="mb-8 text-xs text-slate-400 space-y-1">
          <p>
            By upgrading, you agree to our{" "}
            <a href="/terms" className="text-emerald-300 hover:text-emerald-200 underline">
              Terms
            </a>
            {" "}and{" "}
            <a href="/privacy" className="text-emerald-300 hover:text-emerald-200 underline">
              Privacy
            </a>
            {" "}and{" "}
            <a href="/refund" className="text-emerald-300 hover:text-emerald-200 underline">
              refund/cancellation policy
            </a>
            .
          </p>
          <p>
            {showManageSubscription ? (
              <>
                To cancel or update payment details, use <strong className="text-slate-200">Cancel</strong>{" "}
                below (Paddle billing portal). For other billing help, contact support via{" "}
                <a href="/settings/profile" className="text-emerald-300 hover:text-emerald-200 underline">
                  account settings
                </a>
                .
              </>
            ) : (
              <>
                Need to cancel or billing help? Contact support via{" "}
                <a href="/settings/profile" className="text-emerald-300 hover:text-emerald-200 underline">
                  account settings
                </a>
                .
              </>
            )}
          </p>
          <p>
            Temporary 429 responses are shared system safety limits, separate from plan quotas.
          </p>
        </div>
        {showManageSubscription && <BillingManageSubscriptionCard />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-5 relative z-10">
          {plans.map(plan => {
            const isCurrent = plan.id === currentPlanId;
            const canCheckout = plan.id === "starter" || plan.id === "pro";
            const isContactSales = plan.id === "enterprise";
            return (
              <div
                key={plan.id}
                className={`relative rounded-[32px] border bg-white/[0.02] backdrop-blur-xl px-5 py-6 xl:px-7 xl:py-8 flex flex-col justify-between min-h-[480px] transition-all duration-500 group ${
                  isCurrent
                    ? "border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.2)] bg-white/[0.04]"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {/* Premium Gradient Glow for Current Plan */}
                {isCurrent && (
                  <div className="absolute inset-0 rounded-[32px] bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
                )}

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                      {isCurrent ? "Active License" : isContactSales ? "Contact Sales" : "Paid Plan"}
                    </div>
                    {isCurrent && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-[9px] font-black uppercase tracking-[0.15em] text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                        Current
                      </span>
                    )}
                  </div>
                  <h2 className="text-[24px] xl:text-[30px] leading-none font-black text-white uppercase tracking-tight mb-2">
                    {plan.name}
                  </h2>
                  <div className="flex items-baseline gap-1.5 mb-5">
                    <span className="text-[34px] font-black text-white leading-none">{plan.price}</span>
                    {plan.period && (
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-5 text-slate-400 font-semibold uppercase tracking-widest mb-5">
                    {plan.desc}
                  </p>
                  <ul className="space-y-2 text-[11px] leading-[1.45] text-slate-300">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 mt-[6px]" />
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

