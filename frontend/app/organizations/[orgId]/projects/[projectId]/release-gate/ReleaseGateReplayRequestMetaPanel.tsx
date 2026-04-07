"use client";

import React, { useMemo } from "react";

export type ReplayRequestMeta = {
  replay_overrides_applied?: Record<string, unknown> | null;
  replay_overrides_by_snapshot_id_applied?: Record<string, Record<string, unknown>> | null;
  baseline_snapshot_excerpt?: Record<string, unknown> | null;
  sampling_overrides?: Record<string, unknown> | null;
  has_new_system_prompt?: boolean;
  new_system_prompt_preview?: string | null;
  tool_expectations?: Array<{
    name: string;
    tool_type: "retrieval" | "action";
    description?: string | null;
    result_guide?: string | null;
    baseline_sample_summary?: string | null;
    expected_result_fields?: Array<{ name: string; description?: string | null }> | null;
    expected_action_fields?: Array<{ name: string; description?: string | null }> | null;
  }> | null;
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
  const toolExpectations = Array.isArray(meta?.tool_expectations) ? meta.tool_expectations : [];

  if (!meta) return null;
  if (
    rows.length === 0 &&
    perSnapshotApplied.length === 0 &&
    !meta.has_new_system_prompt &&
    !hasSampling &&
    toolExpectations.length === 0
  ) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-3"
      data-testid="rg-replay-request-meta"
    >
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300/90">
        Replay request data
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        Compare the baseline request data with the values used for this replay.
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
                    Replay · {key}
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
            Per-input changes
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
            Sampling settings
          </div>
          <pre className="mt-1 overflow-x-auto text-[10px] text-slate-300 custom-scrollbar whitespace-pre">
            {previewJson(meta.sampling_overrides)}
          </pre>
        </div>
      ) : null}

      {toolExpectations.length > 0 ? (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-2 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Tool setup
          </div>
          <div className="mt-2 space-y-2">
            {toolExpectations.map(tool => {
              const fields =
                tool.tool_type === "action"
                  ? tool.expected_action_fields ?? []
                  : tool.expected_result_fields ?? [];
              return (
                <div
                  key={`${tool.tool_type}:${tool.name}`}
                  className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-2"
                >
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-semibold text-slate-200">{tool.name}</span>
                    <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-cyan-300/80">
                      {tool.tool_type === "action" ? "Action" : "Retrieval"}
                    </span>
                  </div>
                  {fields.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {fields.map(field => (
                        <span
                          key={`${tool.name}:${field.name}`}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-300"
                          title={field.description || undefined}
                        >
                          {field.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {tool.baseline_sample_summary ? (
                    <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-2 py-2 text-[10px] leading-relaxed text-emerald-100/90 whitespace-pre-wrap break-words">
                      <div className="mb-1 font-bold uppercase tracking-wider text-emerald-300/80">
                        Baseline sample
                      </div>
                      {tool.baseline_sample_summary}
                    </div>
                  ) : null}
                  {tool.result_guide ? (
                    <div className="mt-2 text-[10px] leading-relaxed text-slate-400">
                      <span className="font-semibold text-slate-300">Extra notes:</span>{" "}
                      {tool.result_guide}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {meta.has_new_system_prompt ? (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 px-2 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            System prompt preview
          </div>
          <pre className="mt-1 max-h-28 overflow-x-auto text-[10px] text-slate-300 custom-scrollbar whitespace-pre">
            {meta.new_system_prompt_preview || "—"}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
