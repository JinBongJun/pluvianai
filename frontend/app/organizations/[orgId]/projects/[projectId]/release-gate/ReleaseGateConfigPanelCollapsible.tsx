"use client";

import React from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

export function ReleaseGateConfigPanelCollapsible({
  title,
  subtitle,
  open,
  onToggle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden shadow-sm",
        className
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0c10]"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>
        </div>
        <ChevronDown
          className={clsx("h-5 w-5 shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-white/5 px-5 pb-5 pt-1">{children}</div> : null}
    </div>
  );
}
