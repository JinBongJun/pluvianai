"use client";

import React from "react";
import Link from "next/link";
import clsx from "clsx";

export function ReleaseGateStatusPanel({
  title,
  description,
  tone = "neutral",
  primaryActionLabel,
  onPrimaryAction,
  primaryHref,
}: {
  title: string;
  description: React.ReactNode;
  tone?: "neutral" | "warning" | "danger";
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryHref?: string;
}) {
  const toneClasses =
    tone === "danger"
      ? "border-rose-500/30 bg-[#140f15]"
      : tone === "warning"
        ? "border-amber-500/30 bg-[#15130f]"
        : "border-white/10 bg-[#0f1219]";

  return (
    <div className="flex h-full min-h-[420px] items-center justify-center px-6 py-10">
      <div className={clsx("w-full max-w-2xl rounded-2xl border p-7 shadow-2xl", toneClasses)}>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">{title}</p>
        <div className="mt-3 text-sm leading-relaxed text-slate-200">{description}</div>
        {primaryActionLabel && primaryHref ? (
          <Link
            href={primaryHref}
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            {primaryActionLabel}
          </Link>
        ) : null}
        {primaryActionLabel && onPrimaryAction ? (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            {primaryActionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
