"use client";

import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

import {
  LABORATORY_REFRESH_EVENT,
  type LaboratoryRefreshDetail,
  revalidateLaboratoryAgentListCaches,
} from "@/lib/laboratoryLabRefresh";

const shellClass =
  "bg-[#1a1a1e]/95 border border-white/[0.15] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] rounded-[20px] backdrop-blur-3xl transition-all duration-500 hover:border-white/30";

export function LaboratoryRefreshButton({ projectId }: { projectId: number }) {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (!projectId || Number.isNaN(projectId)) return;
    setBusy(true);
    try {
      await revalidateLaboratoryAgentListCaches(mutate, projectId);
    } finally {
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent<LaboratoryRefreshDetail>(LABORATORY_REFRESH_EVENT, {
            detail: { projectId },
          })
        );
        setBusy(false);
      }, 120);
    }
  }, [mutate, projectId]);

  return (
    <div className="absolute left-6 top-[108px] z-[100]">
      <button
        type="button"
        title="Refresh agent lists (Live View + Release Gate) and fit the map"
        onClick={() => void onClick()}
        className={clsx(
          "flex h-[46px] w-[46px] items-center justify-center text-zinc-400 hover:text-white transition-colors",
          shellClass
        )}
        aria-busy={busy}
      >
        <RefreshCw
          className={clsx("h-5 w-5", busy && "animate-spin motion-reduce:animate-none")}
          strokeWidth={2}
          aria-hidden
        />
      </button>
    </div>
  );
}
