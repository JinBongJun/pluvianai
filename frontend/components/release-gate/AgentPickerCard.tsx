"use client";

import React from "react";
import clsx from "clsx";

export type AgentForPicker = {
  agent_id: string;
  display_name: string;
  model?: string | null;
  worst_count?: number;
  is_ghost?: boolean;
};

type AgentPickerCardProps = {
  agent: AgentForPicker;
  onSelect: () => void;
};

export function AgentPickerCard({ agent, onSelect }: AgentPickerCardProps) {
  const isCritical = (agent.worst_count ?? 0) > 0;
  const status = agent.is_ghost ? "Ghost" : isCritical ? "Critical" : "Online";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full text-left rounded-xl border-2 p-4 transition-all duration-200",
        "hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5",
        "border-white/10 bg-white/[0.02]"
      )}
      aria-label={`Select agent ${agent.display_name}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
            isCritical
              ? "border-rose-500/30 bg-rose-500/10"
              : agent.is_ghost
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-emerald-500/20 bg-emerald-500/10"
          )}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={clsx(
              isCritical ? "text-rose-400" : agent.is_ghost ? "text-amber-400" : "text-emerald-400"
            )}
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-100 truncate">
            {agent.display_name || agent.agent_id}
          </div>
          <div className="text-[13px] text-slate-400 truncate font-mono mt-0.5">
            {agent.model || "—"}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={clsx(
                "w-2 h-2 rounded-full shrink-0",
                isCritical ? "bg-rose-500" : agent.is_ghost ? "bg-amber-400" : "bg-emerald-500"
              )}
              aria-hidden
            />
            <span
              className={clsx(
                "text-xs font-medium",
                isCritical
                  ? "text-rose-400"
                  : agent.is_ghost
                    ? "text-amber-400"
                    : "text-emerald-400"
              )}
            >
              {status}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
