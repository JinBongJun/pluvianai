"use client";

import React, { useEffect, useRef } from "react";

export interface BillingPortalConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

/**
 * Confirmation step before opening Paddle's hosted flow (cancel / manage subscription).
 */
export function BillingPortalConfirmModal({
  open,
  onClose,
  onConfirm,
  loading = false,
}: BillingPortalConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!loading) onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose]);

  useEffect(() => {
    if (open && confirmRef.current) {
      confirmRef.current.focus({ preventScroll: true });
    }
  }, [open]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) onClose();
  };

  const handleConfirm = async () => {
    if (loading) return;
    const result = onConfirm();
    if (result instanceof Promise) {
      await result;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-portal-modal-title"
      aria-describedby="billing-portal-modal-warning"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141820] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h2
            id="billing-portal-modal-title"
            className="text-base font-semibold text-white tracking-tight"
          >
            Cancel subscription
          </h2>
          <p
            id="billing-portal-modal-warning"
            className="mt-3 text-sm leading-relaxed text-amber-200/95"
          >
            If you cancel your subscription, you will lose access to paid plan limits when the current
            period ends (per your Paddle subscription settings). You can manage cancellation and
            invoices in our billing portal.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Go back
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-sm font-medium text-white hover:bg-white/[0.14] transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading ? (
              <>
                <span
                  className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                  aria-hidden
                />
                <span>Opening…</span>
              </>
            ) : (
              "Open billing portal"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
