import React from "react";

export function RestorationSnapshotBadges({
  rb,
}: {
  rb?: { body: boolean; ctx: boolean; sharedCtx: boolean };
}) {
  if (!rb || (!rb.body && !rb.ctx && !rb.sharedCtx)) return null;
  return (
    <>
      {rb.body ? (
        <span
          className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-violet-200"
          title="Per-log replay_overrides (body fields)"
        >
          Body
        </span>
      ) : null}
      {rb.ctx ? (
        <span
          className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-sky-200"
          title="Per-log tool_context text"
        >
          Ctx
        </span>
      ) : null}
      {rb.sharedCtx ? (
        <span
          className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-300"
          title="Shared extra system context (applies to all selected logs)"
        >
          Ctx·all
        </span>
      ) : null}
    </>
  );
}
