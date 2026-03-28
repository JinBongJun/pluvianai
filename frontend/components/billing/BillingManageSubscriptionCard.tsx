"use client";

import { useState } from "react";
import { BillingPortalConfirmModal } from "@/components/billing/BillingPortalConfirmModal";
import { billingAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";

export function BillingManageSubscriptionCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const openPortal = async () => {
    setLoading(true);
    try {
      const data = await billingAPI.createCustomerPortalSession();
      const url = typeof data?.url === "string" ? data.url : null;
      if (!url) throw new Error("Missing portal URL");
      setOpen(false);
      window.location.href = url;
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: { message?: string; code?: string } } } };
      const apiError = ax?.response?.data?.error;
      const msg =
        (typeof apiError?.message === "string" ? apiError.message : null) ||
        (err instanceof Error ? err.message : null) ||
        "Could not open billing portal";
      toast.showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Cancel</h3>
          <p className="mt-1 text-xs text-slate-400">We&apos;ll be sad to see you go.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 self-start sm:self-center px-4 py-2 rounded-xl border border-white/15 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>
      <BillingPortalConfirmModal
        open={open}
        onClose={() => !loading && setOpen(false)}
        onConfirm={openPortal}
        loading={loading}
      />
    </>
  );
}
