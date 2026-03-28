"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { billingAPI } from "@/lib/api";

export type PlanChangeTarget = "starter" | "pro";

export interface PlanChangePreview {
  current_plan: string;
  target_plan: string;
  change_type: "upgrade" | "downgrade";
  proration_billing_mode: string;
  currency_code?: string;
  next_billed_at?: string | null;
  current_period_starts_at?: string | null;
  current_period_ends_at?: string | null;
  due_now_display?: string | null;
  at_next_renewal_display?: string | null;
  recurring_after_change_display?: string | null;
  update_summary_hint?: string | null;
  preview_amounts_available?: boolean;
}

function formatPlanName(id: string): string {
  const x = id.toLowerCase();
  if (x === "starter") return "Starter";
  if (x === "pro") return "Pro";
  return id;
}

function formatDateEn(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export interface PlanChangeConfirmModalProps {
  open: boolean;
  targetPlan: PlanChangeTarget;
  onClose: () => void;
  onApplied: () => void;
}

export function PlanChangeConfirmModal({
  open,
  targetPlan,
  onClose,
  onApplied,
}: PlanChangeConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    setApplyError(null);
    setPreview(null);
    try {
      const data = (await billingAPI.previewPlanChange(targetPlan)) as PlanChangePreview;
      setPreview(data);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg =
        ax?.response?.data?.error?.message ||
        ax?.message ||
        "Could not load plan preview.";
      setPreviewError(msg);
    } finally {
      setLoadingPreview(false);
    }
  }, [targetPlan]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setPreviewError(null);
      setApplyError(null);
      setLoadingPreview(false);
      setConfirming(false);
      return;
    }
    void loadPreview();
  }, [open, loadPreview]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, confirming, onClose]);

  useEffect(() => {
    if (open && confirmRef.current) {
      confirmRef.current.focus({ preventScroll: true });
    }
  }, [open, loadingPreview, preview]);

  const handleConfirm = async () => {
    if (confirming || loadingPreview || previewError || !preview) return;
    setConfirming(true);
    setApplyError(null);
    try {
      await billingAPI.changePlan(targetPlan);
      onApplied();
      onClose();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg =
        ax?.response?.data?.error?.message ||
        ax?.message ||
        "Could not change plan.";
      setApplyError(msg);
    } finally {
      setConfirming(false);
    }
  };

  if (!open) return null;

  const isUpgrade = preview?.change_type === "upgrade";
  const periodEnd = formatDateEn(preview?.current_period_ends_at);
  const nextBill = formatDateEn(preview?.next_billed_at);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !confirming) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-change-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141820] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <h2
            id="plan-change-modal-title"
            className="text-base font-semibold text-white tracking-tight"
          >
            {preview?.change_type === "downgrade"
              ? "Confirm downgrade"
              : preview?.change_type === "upgrade"
                ? "Confirm upgrade"
                : "Change plan"}
          </h2>

          {loadingPreview && (
            <p className="text-sm text-slate-400">Loading pricing preview from Paddle…</p>
          )}

          {previewError && !loadingPreview && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-rose-300">{previewError}</p>
              <button
                type="button"
                onClick={() => void loadPreview()}
                className="text-left text-sm text-emerald-400 hover:text-emerald-300 underline w-fit"
              >
                Try again
              </button>
            </div>
          )}

          {applyError && (
            <p className="text-sm text-rose-300">{applyError}</p>
          )}

          {preview && !loadingPreview && !previewError && (
            <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
              <p>
                Change from <span className="text-white font-medium">{formatPlanName(preview.current_plan)}</span>{" "}
                to <span className="text-white font-medium">{formatPlanName(preview.target_plan)}</span>.
              </p>

              {isUpgrade && (
                <>
                  <p className="text-amber-100/95 border border-amber-500/25 rounded-lg p-3 bg-amber-500/5">
                    {preview.due_now_display ? (
                      <>
                        Estimated charge <strong className="text-white">now</strong> (prorated):{" "}
                        <strong className="text-emerald-300">{preview.due_now_display}</strong> (plus
                        applicable tax). Your payment method on file will be charged by Paddle; you will
                        receive a receipt by email.
                      </>
                    ) : (
                      <>
                        Paddle will charge a <strong className="text-white">prorated upgrade</strong> to your
                        saved payment method. Exact totals appear on your Paddle receipt and confirmation
                        email.
                      </>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    By confirming, you authorize this subscription update and any immediate charge Paddle
                    calculates for the upgrade.
                  </p>
                </>
              )}

              {!isUpgrade && (
                <>
                  <p className="text-sky-100/95 border border-sky-500/25 rounded-lg p-3 bg-sky-500/5">
                    You <strong className="text-white">keep {formatPlanName(preview.current_plan)}</strong>{" "}
                    limits until the end of the current billing period
                    {periodEnd ? (
                      <>
                        {" "}
                        (through <strong className="text-white">{periodEnd}</strong>).
                      </>
                    ) : (
                      "."
                    )}
                  </p>
                  <p>
                    Starting{" "}
                    {nextBill ? (
                      <strong className="text-white">{nextBill}</strong>
                    ) : (
                      "your next renewal date"
                    )}
                    , your subscription renews at the <strong className="text-white">{formatPlanName(preview.target_plan)}</strong>{" "}
                    price.
                  </p>
                  {(preview.at_next_renewal_display || preview.recurring_after_change_display) && (
                    <p>
                      Indicative amount on that renewal:{" "}
                      <strong className="text-emerald-300">
                        {preview.at_next_renewal_display || preview.recurring_after_change_display}
                      </strong>{" "}
                      (taxes may apply; final amount on Paddle invoice).
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    No separate checkout screen: the change is scheduled with Paddle; you will receive email
                    confirmation when the next invoice is issued.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loadingPreview || confirming || !preview}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming
              ? "Applying…"
              : isUpgrade
                ? "Confirm & pay"
                : "Schedule downgrade"}
          </button>
        </div>
      </div>
    </div>
  );
}
