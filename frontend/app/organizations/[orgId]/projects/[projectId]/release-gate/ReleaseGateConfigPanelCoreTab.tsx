"use client";

import React from "react";
import clsx from "clsx";
import { RefreshCcw } from "lucide-react";

import type { ReplayProvider } from "./releaseGatePageContent.lib";
import { isHostedPlatformModel } from "./releaseGateReplayConstants";
import { formatProviderLabel } from "./releaseGateConfigPanelHelpers";
import type { ReleaseGateConfigThresholdPreset } from "./releaseGateConfigPanelTypes";
import type { ReleaseGateConfigPanelCoreTabProps } from "./releaseGateConfigPanelModel.types";

export function ReleaseGateConfigPanelCoreTab({ m }: { m: ReleaseGateConfigPanelCoreTabProps }) {
  const {
    modelOverrideEnabled,
    repeatRuns,
    REPLAY_THRESHOLD_PRESETS,
    thresholdPreset,
    setThresholdPreset,
    normalizeGateThresholds,
    failRateMax,
    setFailRateMax,
    flakyRateMax,
    setFlakyRateMax,
    editsLocked,
    newModel,
    setNewModel,
    replayProvider,
    setReplayProvider,
    replayUserApiKeyId,
    setReplayUserApiKeyId,
    projectUserApiKeysForUi,
    setModelOverrideEnabled,
    replayModelMode,
    setReplayModelMode,
    REPLAY_PROVIDER_MODEL_LIBRARY,
    activeProviderTab,
    setActiveProviderTab,
    pinnedBadge,
    showCustomModelWarning,
    runDataModel,
    runDataProvider,
    requestSystemPrompt,
    setRequestBody,
    applySystemPromptToBody,
    isSystemPromptOverridden,
    handleResetSystemPrompt,
    requestBody,
    updateRequestNumberField,
    isJsonModified,
    baselinePayload,
    handleResetJsonToBaseline,
    candidateJsonValue,
    setRequestJsonDraft,
    handleRequestJsonBlur,
    requestJsonError,
  } = m;

  const hostedMode = replayModelMode === "hosted";
  const customMode = replayModelMode === "custom";

  return (
    <>
      {modelOverrideEnabled && (
        <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-5 py-4 text-sm text-fuchsia-200 font-medium">
          {hostedMode
            ? "Hosted (PluvianAI): platform inference and included credits. Personal API key is not required."
            : "Custom (BYOK): enter any supported model id; your saved or project default API key is used for this run."}
        </div>
      )}

      <div className="rounded-2xl border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/[0.08] to-transparent p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-fuchsia-300/90 mb-2">
          Candidate run (all selected logs)
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          One candidate per run: the same model, system prompt, sampling, thresholds, and config JSON apply to
          every selected log. Use Environment parity when specific logs need different attachments, metadata, or
          injected context.
        </p>
        {repeatRuns > 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Repeat runs: <span className="font-mono text-slate-300">{repeatRuns}×</span> (from the run controls
            on the main screen)
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
              Strictness
            </div>
            <div className="text-base font-semibold text-white">Release Gate Thresholds</div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>
              Fail max:{" "}
              <span className="text-slate-200 font-medium">{Math.round(failRateMax * 100)}%</span>
            </div>
            <div>
              Flaky max:{" "}
              <span className="text-slate-200 font-medium">{Math.round(flakyRateMax * 100)}%</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {(Object.keys(REPLAY_THRESHOLD_PRESETS) as Array<keyof typeof REPLAY_THRESHOLD_PRESETS>).map(key => {
            const preset = REPLAY_THRESHOLD_PRESETS[key];
            return (
              <button
                key={key}
                type="button"
                disabled={editsLocked}
                onClick={() => {
                  setThresholdPreset?.(key as ReleaseGateConfigThresholdPreset);
                  if (key !== "custom" && normalizeGateThresholds) {
                    const normalized = normalizeGateThresholds(preset.failRateMax, preset.flakyRateMax);
                    setFailRateMax?.(normalized.failRateMax);
                    setFlakyRateMax?.(normalized.flakyRateMax);
                  }
                }}
                className={clsx(
                  "rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-all disabled:cursor-not-allowed disabled:opacity-40",
                  thresholdPreset === key
                    ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-100 shadow-[0_0_15px_rgba(217,70,239,0.15)]"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {thresholdPreset === "custom" && (
          <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-white/5">
            <label className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 block">
                Fail %
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Number.isFinite(failRateMax) ? Math.round(failRateMax * 100) : 0}
                disabled={editsLocked}
                onChange={e => {
                  const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setThresholdPreset?.("custom");
                  setFailRateMax?.(next / 100);
                }}
                className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 block">
                Flaky %
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Number.isFinite(flakyRateMax) ? Math.round(flakyRateMax * 100) : 0}
                disabled={editsLocked}
                onChange={e => {
                  const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setThresholdPreset?.("custom");
                  setFlakyRateMax?.(next / 100);
                }}
                className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
              />
            </label>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
              Model Settings
            </div>
            <div className="flex items-center gap-3">
              <div className="text-base font-semibold text-white">
                {modelOverrideEnabled ? newModel || "Not specified" : runDataModel || "Not detected"}
              </div>
              {pinnedBadge && (
                <span
                  className={clsx(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]",
                    pinnedBadge === "Pinned"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                  )}
                  title={
                    pinnedBadge === "Pinned"
                      ? "Pinned model id (versioned) — best for reproducible gates."
                      : "Custom model id — may reduce reproducibility."
                  }
                >
                  {pinnedBadge}
                </span>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>
              Provider:{" "}
              <span className="text-slate-200">
                {modelOverrideEnabled ? formatProviderLabel(replayProvider) : formatProviderLabel(runDataProvider)}
              </span>
            </div>
            <div className="mt-0.5">
              {modelOverrideEnabled ? (
                <span className="text-fuchsia-300">Override active</span>
              ) : (
                "Using detected model"
              )}
            </div>
          </div>
        </div>

        {modelOverrideEnabled && (
          <div className="mb-5 rounded-xl border border-white/10 bg-[#0a0c10]/80 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">
              Model source
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="release-gate-replay-model-mode"
                  className="accent-fuchsia-500"
                  disabled={editsLocked}
                  checked={hostedMode}
                  onChange={() => {
                    if (editsLocked) return;
                    setModelOverrideEnabled?.(true);
                    setReplayModelMode?.("hosted");
                    setReplayUserApiKeyId?.(null);
                    const first = (REPLAY_PROVIDER_MODEL_LIBRARY?.[replayProvider] || [])[0];
                    if (first) setNewModel?.(first);
                  }}
                />
                Hosted (PluvianAI)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="release-gate-replay-model-mode"
                  className="accent-fuchsia-500"
                  disabled={editsLocked}
                  checked={customMode}
                  onChange={() => {
                    if (editsLocked) return;
                    setModelOverrideEnabled?.(true);
                    setReplayModelMode?.("custom");
                    setReplayUserApiKeyId?.(null);
                    setNewModel?.("");
                  }}
                />
                Custom (BYOK)
              </label>
            </div>
          </div>
        )}

        <label className="block mb-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2 block">
            Provider
          </span>
          <select
            disabled={editsLocked || !modelOverrideEnabled}
            value={activeProviderTab}
            onChange={e => {
              const p = e.target.value as ReplayProvider;
              const prevProvider = replayProvider;
              const trimmed = newModel.trim();
              // Must enable override so useReleaseGateConfigPanelCoreTabModel's sync effect
              // does not reset activeProviderTab to runDataProvider while user is picking a provider.
              setModelOverrideEnabled?.(true);
              setActiveProviderTab(p);
              setReplayProvider?.(p);
              setReplayUserApiKeyId?.(null);
              // Hosted: align quick-pick id when switching away from another provider's hosted model.
              if (
                hostedMode &&
                trimmed &&
                isHostedPlatformModel(prevProvider, trimmed) &&
                !isHostedPlatformModel(p, trimmed)
              ) {
                const nextHosted = (REPLAY_PROVIDER_MODEL_LIBRARY?.[p] || [])[0];
                setNewModel?.(nextHosted ?? "");
              }
            }}
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50"
          >
            {(Object.keys(REPLAY_PROVIDER_MODEL_LIBRARY || {}) as ReplayProvider[]).map(provider => (
              <option key={provider} value={provider}>
                {formatProviderLabel(provider)}
              </option>
            ))}
          </select>
        </label>

        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">
          Hosted quick picks
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {(REPLAY_PROVIDER_MODEL_LIBRARY?.[activeProviderTab] || []).map(modelId => (
            <button
              key={modelId}
              type="button"
              disabled={editsLocked || !modelOverrideEnabled || customMode}
              onClick={() => {
                if (editsLocked || customMode) return;
                setReplayModelMode?.("hosted");
                setReplayProvider?.(activeProviderTab);
                setNewModel?.(modelId);
                setReplayUserApiKeyId?.(null);
                setModelOverrideEnabled?.(true);
              }}
              className={clsx(
                "rounded-xl border px-4 py-3.5 text-left text-[13px] font-mono transition-all duration-200",
                newModel === modelId && replayProvider === activeProviderTab
                  ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-100 shadow-[0_0_15px_rgba(217,70,239,0.15)]"
                  : "border-white/10 bg-[#0a0c10] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]",
                (!modelOverrideEnabled || customMode) && "opacity-40 cursor-not-allowed hover:border-white/10 hover:bg-[#0a0c10]"
              )}
            >
              {modelId}
            </button>
          ))}
        </div>

        <div
          className={clsx(
            "pt-4 border-t border-white/5",
            hostedMode && modelOverrideEnabled && "opacity-50 pointer-events-none"
          )}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 block">
              Custom model ID{" "}
              <span className="text-slate-500 font-normal lowercase tracking-normal ml-1">(BYOK)</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Custom models require BYOK. Supported providers: OpenAI, Anthropic, Google. Premium models (e.g. GPT-4o,
            Claude Sonnet, Gemini Pro) are not available as hosted quick picks — enter the model id here and select a
            saved key or register a project default key.
          </p>
          {customMode && modelOverrideEnabled && newModel.trim() ? (
            <label className="block mb-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2 block">
                Saved API key (optional)
              </span>
              <select
                disabled={editsLocked}
                value={replayUserApiKeyId ?? ""}
                onChange={e => {
                  const v = e.target.value;
                  setReplayUserApiKeyId?.(v === "" ? null : Number(v));
                }}
                className="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50"
              >
                <option value="">Use project default key lookup</option>
                {(projectUserApiKeysForUi || [])
                  .filter(
                    k =>
                      k.is_active &&
                      String(k.provider || "")
                        .trim()
                        .toLowerCase() === replayProvider
                  )
                  .map(k => (
                    <option key={k.id} value={k.id}>
                      {(k.name || `${k.provider} key`).trim()}
                      {k.agent_id ? ` · node ${k.agent_id}` : " · project default"}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <input
            value={newModel}
            disabled={editsLocked || !modelOverrideEnabled || hostedMode}
            onChange={e => {
              if (editsLocked || hostedMode) return;
              setReplayModelMode?.("custom");
              setReplayProvider?.(activeProviderTab);
              setNewModel?.(e.target.value);
              setModelOverrideEnabled?.(true);
            }}
            placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
            className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-100 font-mono outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {showCustomModelWarning && customMode && (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90 leading-relaxed">
              For stable Release Gate results, prefer a pinned Anthropic model id ending in{" "}
              <span className="font-mono bg-black/20 px-1 py-0.5 rounded">YYYYMMDD</span>.
              <span className="block mt-1 text-amber-400/80">Custom/latest ids can change behavior over time.</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
          <span
            className={clsx(
              "text-xs font-medium",
              modelOverrideEnabled ? "text-fuchsia-300" : "text-slate-500"
            )}
          >
            {modelOverrideEnabled
              ? "Model override is active for this run"
              : "Currently using detected baseline model"}
          </span>
          {modelOverrideEnabled && (
            <button
              type="button"
              disabled={editsLocked}
              onClick={() => {
                if (editsLocked) return;
                setModelOverrideEnabled?.(false);
                setReplayModelMode?.("hosted");
                setNewModel?.(runDataModel || "");
                setReplayProvider?.(runDataProvider);
                setReplayUserApiKeyId?.(null);
              }}
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all"
            >
              Reset to detected
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm flex flex-col">
        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3 block">
          System Prompt
        </div>
        <textarea
          value={requestSystemPrompt}
          disabled={editsLocked}
          onChange={e => {
            if (editsLocked) return;
            if (!setRequestBody || !applySystemPromptToBody) return;
            setRequestBody(prev => applySystemPromptToBody(prev, e.target.value));
          }}
          placeholder="Override system prompt for the candidate run"
          className="min-h-[140px] w-full flex-1 rounded-xl border border-white/10 bg-[#0a0c10] p-4 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={editsLocked || !isSystemPromptOverridden}
            onClick={handleResetSystemPrompt}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Reset to node default
          </button>
          <div className="text-xs text-slate-500">
            {isSystemPromptOverridden ? "Override active" : "Using node default"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
        <div className="mb-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">Sampling</div>
          <div className="text-sm text-slate-400">
            Adjust candidate generation knobs without changing snapshot content.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
              Temperature
            </span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={typeof requestBody.temperature === "number" ? requestBody.temperature : ""}
              onChange={e => updateRequestNumberField("temperature", e.target.value)}
              disabled={editsLocked}
              className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
              Max tokens
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={typeof requestBody.max_tokens === "number" ? requestBody.max_tokens : ""}
              onChange={e => updateRequestNumberField("max_tokens", e.target.value)}
              disabled={editsLocked}
              className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">Top p</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={typeof requestBody.top_p === "number" ? requestBody.top_p : ""}
              onChange={e => updateRequestNumberField("top_p", e.target.value)}
              disabled={editsLocked}
              className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                Config-only JSON
              </div>
              {isJsonModified && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-400 border border-amber-500/20">
                  Modified
                </span>
              )}
            </div>
            <div className="text-sm text-slate-400">
              Run-wide JSON merged for every log. Excludes tools (Environment parity tab), system prompt (field
              above), and per-snapshot restoration fields. Prefer{" "}
              <span className="font-mono text-slate-500">replay_overrides</span> in Environment parity for
              attachments and other non-message fields that vary by snapshot.
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetJsonToBaseline}
            disabled={editsLocked || !isJsonModified || !baselinePayload}
            className="shrink-0 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Reset to baseline
          </button>
        </div>
        <textarea
          value={candidateJsonValue}
          disabled={editsLocked}
          onChange={e => setRequestJsonDraft?.(e.target.value)}
          onBlur={() => handleRequestJsonBlur?.()}
          spellCheck={false}
          className="min-h-[300px] w-full flex-1 rounded-xl border border-white/10 bg-[#0a0c10] p-5 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
        />
        {requestJsonError && (
          <div className="mt-3 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {requestJsonError}
          </div>
        )}
      </div>
    </>
  );
}
