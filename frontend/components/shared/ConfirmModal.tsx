"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "neutral";
  loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
}) => {
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

  const isDanger = variant === "danger";

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
      aria-labelledby="confirm-modal-title"
      aria-describedby={description ? "confirm-modal-desc" : undefined}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0f1e] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-white/5">
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-modal-title"
              className="text-sm font-black text-white uppercase tracking-wider"
            >
              {title}
            </h2>
            {description && (
              <p id="confirm-modal-desc" className="mt-2 text-sm text-slate-400 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="shrink-0 p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
            aria-label={cancelLabel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={
              isDanger
                ? "px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
                : "px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-slate-200 text-sm font-medium hover:bg-white/15 transition-colors disabled:opacity-50 flex items-center gap-2"
            }
            aria-label={confirmLabel}
          >
            {loading ? (
              <>
                <span
                  className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                  aria-hidden
                />
                <span>Please wait…</span>
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
