"use client";

import React, { useMemo } from "react";

export type ReplayRequestMeta = {
  replay_overrides_applied?: Record<string, unknown> | null;
  replay_overrides_by_snapshot_id_applied?: Record<string, Record<string, unknown>> | null;
  baseline_snapshot_excerpt?: Record<string, unknown> | null;
  sampling_overrides?: Record<string, unknown> | null;
  has_new_system_prompt?: boolean;
  new_system_prompt_preview?: string | null;
};

function previewJson(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Shows first baseline log excerpt vs merged replay body overrides for this run (when present).
 */
export function ReleaseGateReplayRequestMetaPanel({ meta }: { meta: ReplayRequestMeta | null }) {
  const rows = useMemo(() => {
    if (!meta) return [];
    const applied = meta.replay_overrides_applied;
    if (!applied || typeof applied !== "object") return [];
    return Object.keys(applied).sort();
  }, [meta]);

  const perSnapshotApplied = useMemo(() => {
    const raw = meta?.replay_overrides_by_snapshot_id_applied;
    if (!raw || typeof raw !== "object") return [] as Array<{ sid: string; keys: string[] }>;
    return Object.keys(raw)
      .sort()
      .map(sid => ({
        sid,
        keys: Object.keys(raw[sid] && typeof raw[sid] === "object" ? raw[sid]! : {}).sort(),
      }));
  }, [meta]);

  const hasSampling =
    meta?.sampling_overrides &&
    typeof meta.sampling_overrides === "object" &&
    Object.keys(meta.sampling_overrides).length > 0;

  if (!meta) return null;
  if (
    rows.length === 0 &&
    perSnapshotApplied.length === 0 &&
    !meta.has_new_system_prompt &&
    !hasSampling
  ) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-3"
      data-testid="rg-replay-request-meta"
    >
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300/90">
        Request body overrides (this run)
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        For each key in <span className="font-mono text-slate-400">replay_overrides</span>: value on
        the <span className="text-slate-400">first baseline log</span> vs merged for replay.
      </p>

      {rows.length > 0 ? (
        <div className="mt-3 space-y-2">
          {rows.map(key => {
            const baselineVal = meta.baseline_snapshot_excerpt?.[key];
            const appliedVal = meta.replay_overrides_applied?.[key];
            return (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-2"
              >
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Baseline · {key}
                  </div>
                  <pre className="mt-1 max-h-32 overflow-x-auto text-[10px] leading-snug text-slate-400 custom-scrollbar whitespace-pre">
                    {previewJson(baselineVal)}
                  </pre>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-cyan-400/80">
                    Applied · {key}
                  </div>
                  <pre className="mt-1 max-h-32 overflow-x-auto text-[10px] leading-snug text-slate-200 custom-scrollbar whitespace-pre">
                    {previewJson(appliedVal)}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {perSnapshotApplied.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Per-log overrides (applied)
          </div>
          {perSnapshotApplied.map(({ sid, keys }) => {
            const block = meta.replay_overrides_by_snapshot_id_applied?.[sid];
            return (
              <details
                key={sid}
                className="group rounded-xl border border-white/[0.06] bg-black/20 px-2 py-2"
              >
                <summary className="cursor-pointer list-none text-[10px] font-mono text-slate-300 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="text-cyan-400/90">id {sid}</span>
                  {keys.length ? (
                    <span className="ml-2 text-slate-500">
                      ({keys.length} key{keys.length === 1 ? "" : "s"})
                    </span>
                  ) : null}
                </summary>
                <pre className="mt-2 max-h-40 overflow-x-auto text-[10px] leading-snug text-slate-200 custom-scrollbar whitespace-pre">
                  {previewJson(block)}
                </pre>
              </details>
            );
          })}
        </div>
      ) : null}

      {hasSampling ? (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-2 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Sampling overrides
          </div>
          <pre className="mt-1 overflow-x-auto text-[10px] text-slate-300 custom-scrollbar whitespace-pre">
            {previewJson(meta.sampling_overrides)}
          </pre>
        </div>
      ) : null}

      {meta.has_new_system_prompt ? (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-2 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            System prompt override (preview)
          </div>
          <pre className="mt-1 max-h-28 overflow-x-auto text-[10px] text-slate-300 custom-scrollbar whitespace-pre">
            {meta.new_system_prompt_preview || "—"}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
