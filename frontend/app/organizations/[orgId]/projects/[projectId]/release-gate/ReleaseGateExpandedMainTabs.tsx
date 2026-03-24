"use client";

import React from "react";
import clsx from "clsx";

import type { GateTab } from "./releaseGateExpandedHelpers";

export function ReleaseGateExpandedMainTabs({
  tab,
  setTab,
}: {
  tab: GateTab;
  setTab: (t: GateTab) => void;
}) {
  return (
    <div className="absolute top-6 left-6 right-6 flex items-start justify-end pointer-events-none z-[10000]">
      <div className="mt-[70px] flex rounded-2xl border border-white/10 bg-[#1a1a1e]/90 p-1.5 shadow-2xl pointer-events-auto">
        <button
          type="button"
          onClick={() => setTab("validate")}
          data-testid="rg-main-tab-validate"
          className={clsx(
            "px-6 py-2 text-xs font-bold rounded-xl transition-all duration-300",
            tab === "validate"
              ? "bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/30 shadow-[0_0_20px_rgba(217,70,239,0.2)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
          )}
        >
          Validate
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          data-testid="rg-main-tab-history"
          className={clsx(
            "px-6 py-2 text-xs font-bold rounded-xl transition-all duration-300",
            tab === "history"
              ? "bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
          )}
        >
          History
        </button>
      </div>
    </div>
  );
}
