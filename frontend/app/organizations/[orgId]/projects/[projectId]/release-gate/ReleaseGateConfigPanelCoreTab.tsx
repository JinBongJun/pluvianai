"use client";

import React, { useCallback, useMemo, useState } from "react";
import clsx from "clsx";

import { projectUserApiKeysAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { getProjectPermissionToast } from "@/lib/projectAccess";
import type { ReplayProvider } from "./releaseGatePageContent.lib";
import { isHostedPlatformModel } from "./releaseGateReplayConstants";
import { formatProviderLabel } from "./releaseGateConfigPanelHelpers";
import {
  isReleaseGateSavedProjectKey,
  RELEASE_GATE_SAVED_API_KEY_NAME_PREFIX,
} from "./releaseGateSavedApiKeys";
import type { ReleaseGateConfigThresholdPreset } from "./releaseGateConfigPanelTypes";
import type { ReleaseGateConfigPanelCoreTabProps } from "./releaseGateConfigPanelModel.types";

export function ReleaseGateConfigPanelCoreTab({ m }: { m: ReleaseGateConfigPanelCoreTabProps }) {
  const toast = useToast();
  const {
    modelSource,
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
    hostedReplayCreditsExhausted,
    newModel,
    setNewModel,
    replayProvider,
    setReplayProvider,
    replayUserApiKeyId,
    setReplayUserApiKeyId,
    projectUserApiKeysForUi,
    setModelSource,
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
    keyIssueBlocked,
    keyRegistrationMessage,
    missingProviderKeyDetails,
    canValidate,
    mutateProjectUserApiKeys,
    projectId,
    replayApiKey,
    setReplayApiKey,
  } = m;

  const [rgSaveBusy, setRgSaveBusy] = useState(false);
  const [rgDeleteBusyId, setRgDeleteBusyId] = useState<number | null>(null);
  const [rgSaveLabel, setRgSaveLabel] = useState("");

  const detectedMode = modelSource === "detected";
  const hostedMode = modelSource === "hosted";
  const customMode = modelSource === "custom";
  const normalizedThresholds = normalizeGateThresholds(failRateMax, flakyRateMax);

  const selectModelSource = (next: typeof modelSource) => {
    if (editsLocked) return;
    if (next === "hosted" && hostedReplayCreditsExhausted) return;
    setModelSource?.(next);
    if (next === "detected") {
      setReplayUserApiKeyId?.(null);
      setReplayApiKey?.("");
      setNewModel?.(runDataModel || "");
      setReplayProvider?.(runDataProvider);
      setActiveProviderTab?.(runDataProvider);
      return;
    }
    const nextProvider = activeProviderTab || replayProvider;
    setReplayProvider?.(nextProvider);
    setActiveProviderTab?.(nextProvider);
    setReplayUserApiKeyId?.(null);
    setReplayApiKey?.("");
    if (next === "hosted") {
      const firstHosted = (REPLAY_PROVIDER_MODEL_LIBRARY?.[nextProvider] || [])[0];
      if (firstHosted) setNewModel?.(firstHosted);
      return;
    }
    if (!customMode) setNewModel?.("");
  };

  const keyStatusText =
    keyRegistrationMessage ||
    (detectedMode && !canValidate
      ? "Select baseline logs or saved datasets for this run to verify required API keys."
      : detectedMode
        ? "Select baseline logs to detect provider, model, and required API keys."
        : customMode
          ? "Paste a provider API key for this run, or save it below for reuse on this project."
          : "Paste an API key for this run or rely on project default key lookup.");

  const keyStatusLabel = keyIssueBlocked ? "Blocked" : keyRegistrationMessage ? "Ready" : "Pending";
  const keyStatusToneClasses = keyIssueBlocked
    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
    : keyRegistrationMessage
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      : "border-white/10 bg-[#0a0c10] text-slate-300";

  const rgSavedKeysForProvider = useMemo(
    () =>
      (projectUserApiKeysForUi || []).filter(k =>
        isReleaseGateSavedProjectKey(
          k,
          String(replayProvider || "")
            .trim()
            .toLowerCase()
        )
      ),
    [projectUserApiKeysForUi, replayProvider]
  );

  const saveRgKeyFromPaste = useCallback(async () => {
    const trimmed = replayApiKey.trim();
    if (!projectId || !trimmed || rgSaveBusy || editsLocked) return;
    setRgSaveBusy(true);
    try {
      const labelPart = rgSaveLabel.trim().slice(0, 80);
      const name = labelPart
        ? `${RELEASE_GATE_SAVED_API_KEY_NAME_PREFIX} ${labelPart}`
        : `${RELEASE_GATE_SAVED_API_KEY_NAME_PREFIX} ${formatProviderLabel(replayProvider)} · ${new Date().toISOString().slice(0, 10)}`;
      const created = (await projectUserApiKeysAPI.create(projectId, {
        provider: replayProvider,
        api_key: trimmed,
        name,
      })) as { id?: number };
      await mutateProjectUserApiKeys?.();
      setReplayApiKey?.("");
      setRgSaveLabel("");
      if (typeof created?.id === "number") setReplayUserApiKeyId?.(created.id);
    } catch (error) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Saving project API keys",
        error,
      });
      toast.showToast(
        permissionToast?.message ?? "Failed to save the pasted key.",
        permissionToast?.tone ?? "error"
      );
    } finally {
      setRgSaveBusy(false);
    }
  }, [
    projectId,
    replayApiKey,
    rgSaveBusy,
    editsLocked,
    rgSaveLabel,
    replayProvider,
    mutateProjectUserApiKeys,
    setReplayApiKey,
    setReplayUserApiKeyId,
    toast,
  ]);

  const deleteRgSavedKey = useCallback(
    async (keyId: number) => {
      if (!projectId || rgDeleteBusyId != null || editsLocked) return;
      setRgDeleteBusyId(keyId);
      try {
        await projectUserApiKeysAPI.delete(projectId, keyId);
        await mutateProjectUserApiKeys?.();
        if (replayUserApiKeyId === keyId) setReplayUserApiKeyId?.(null);
      } catch (error) {
        const permissionToast = getProjectPermissionToast({
          featureLabel: "Removing project API keys",
          error,
        });
        toast.showToast(
          permissionToast?.message ?? "Failed to delete the saved key.",
          permissionToast?.tone ?? "error"
        );
      } finally {
        setRgDeleteBusyId(null);
      }
    },
    [
      projectId,
      rgDeleteBusyId,
      editsLocked,
      mutateProjectUserApiKeys,
      replayUserApiKeyId,
      setReplayUserApiKeyId,
      toast,
    ]
  );

  return (
    <>
      <div className="rounded-xl border border-white/6 bg-white/[0.02] px-5 py-3 text-sm text-slate-300">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Change the candidate run here.</span>
          <span className="text-slate-500">
            Use Advanced settings for fidelity, tools, sampling, or extra context.
          </span>
          {repeatRuns > 0 ? (
            <span className="text-slate-500">
              Repeat runs: <strong className="font-mono text-slate-300">{repeatRuns}x</strong>
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
              1. Model
            </div>
            <div className="flex items-center gap-3">
              <div className="text-base font-semibold text-white">
                {detectedMode
                  ? runDataModel || "Not detected"
                  : newModel || (hostedMode ? "Select a hosted model" : "Enter a custom model")}
              </div>
              {pinnedBadge && (
                <span
                  className={clsx(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]",
                    pinnedBadge === "Pinned"
                      ? "border border-emerald-500/20 bg-emerald-500/15 text-emerald-300"
                      : "border border-amber-500/20 bg-amber-500/15 text-amber-300"
                  )}
                  title={
                    pinnedBadge === "Pinned"
                      ? "Pinned model id (versioned), best for reproducible gates."
                      : "Custom model id; may reduce reproducibility."
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
                {formatProviderLabel(detectedMode ? runDataProvider : replayProvider)}
              </span>
            </div>
            <div className="mt-0.5">
              <span className={detectedMode ? "text-slate-400" : "text-fuchsia-300"}>
                {detectedMode
                  ? "Using detected baseline model"
                  : hostedMode
                    ? "Using hosted model"
                    : "Using custom BYOK model"}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-[#0a0c10]/80 px-4 py-2.5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
            Model source
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="release-gate-model-source"
                className="accent-fuchsia-500"
                disabled={editsLocked}
                checked={detectedMode}
                onChange={() => selectModelSource("detected")}
              />
              Detected from baseline
            </label>
            <label
              className={clsx(
                "flex items-center gap-2 text-sm",
                editsLocked || hostedReplayCreditsExhausted
                  ? "cursor-not-allowed text-slate-500"
                  : "cursor-pointer text-slate-200"
              )}
              title={
                hostedReplayCreditsExhausted
                  ? "Monthly Release Gate usage is exhausted. Reduce selected logs or repeats, or wait for the next billing period."
                  : undefined
              }
            >
              <input
                type="radio"
                name="release-gate-model-source"
                className="accent-fuchsia-500"
                disabled={editsLocked || hostedReplayCreditsExhausted}
                checked={hostedMode}
                onChange={() => selectModelSource("hosted")}
              />
              Hosted by PluvianAI
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="release-gate-model-source"
                className="accent-fuchsia-500"
                disabled={editsLocked}
                checked={customMode}
                onChange={() => selectModelSource("custom")}
              />
              Custom (BYOK)
            </label>
          </div>
        </div>

        {!detectedMode && (
          <label className="block mb-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2 block">
              Provider
            </span>
            <select
              disabled={editsLocked}
              value={activeProviderTab}
              onChange={e => {
                const p = e.target.value as ReplayProvider;
                const prevProvider = replayProvider;
                const trimmed = newModel.trim();
                setActiveProviderTab(p);
                setReplayProvider?.(p);
                setReplayUserApiKeyId?.(null);
                setReplayApiKey?.("");
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
              {(Object.keys(REPLAY_PROVIDER_MODEL_LIBRARY || {}) as ReplayProvider[]).map(
                provider => (
                  <option key={provider} value={provider}>
                    {formatProviderLabel(provider)}
                  </option>
                )
              )}
            </select>
          </label>
        )}

        {detectedMode && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-300">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Detected provider
                </div>
                <div className="mt-1 text-slate-100">{formatProviderLabel(runDataProvider)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Detected model id
                </div>
                <div className="mt-1 font-mono text-slate-100">
                  {runDataModel || "Not detected"}
                </div>
              </div>
            </div>
          </div>
        )}

        {hostedMode && (
          <>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">
              Hosted quick picks
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {(REPLAY_PROVIDER_MODEL_LIBRARY?.[activeProviderTab] || []).map(modelId => (
                <button
                  key={modelId}
                  type="button"
                  disabled={editsLocked}
                  onClick={() => {
                    if (editsLocked) return;
                    setModelSource?.("hosted");
                    setReplayProvider?.(activeProviderTab);
                    setNewModel?.(modelId);
                    setReplayUserApiKeyId?.(null);
                    setReplayApiKey?.("");
                  }}
                  className={clsx(
                    "rounded-xl border px-4 py-3.5 text-left text-[13px] font-mono transition-all duration-200",
                    newModel === modelId && replayProvider === activeProviderTab
                      ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-100 shadow-[0_0_15px_rgba(217,70,239,0.15)]"
                      : "border-white/10 bg-[#0a0c10] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]"
                  )}
                >
                  {modelId}
                </button>
              ))}
            </div>
          </>
        )}

        {customMode && (
          <div className="pt-4 border-t border-white/5">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 block">
                Custom model ID{" "}
                <span className="text-slate-500 font-normal lowercase tracking-normal ml-1">
                  (BYOK)
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Custom models require BYOK. Supported providers: OpenAI, Anthropic, Google. Premium
              models (e.g. GPT-4o, Claude Sonnet, Gemini Pro) are not available as hosted quick
              picks, so enter the provider model id here (for example{" "}
              <span className="font-mono text-slate-400">gpt-4o-mini</span>), then paste a key or
              use a key you saved from this screen.
            </p>
            <input
              name="release-gate-custom-model-id"
              autoComplete="off"
              value={newModel}
              disabled={editsLocked}
              onChange={e => {
                if (editsLocked) return;
                setModelSource?.("custom");
                setReplayProvider?.(activeProviderTab);
                setNewModel?.(e.target.value);
              }}
              placeholder="e.g. gpt-4o-mini, claude-sonnet-4-20250514"
              className="mb-3 w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-100 font-mono outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
            />
            {showCustomModelWarning && (
              <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90 leading-relaxed">
                For stable Release Gate results, prefer a pinned Anthropic model id ending in{" "}
                <span className="font-mono bg-black/20 px-1 py-0.5 rounded">YYYYMMDD</span>.
                <span className="block mt-1 text-amber-400/80">
                  Custom/latest ids can change behavior over time.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
          <span
            className={clsx(
              "text-[11px] font-medium",
              detectedMode ? "text-slate-500" : "text-fuchsia-300"
            )}
          >
            {detectedMode
              ? "Using detected baseline model"
              : hostedMode
                ? "Hosted model is active for this run"
                : "Custom BYOK model is active for this run"}
          </span>
          {!detectedMode && (
            <button
              type="button"
              disabled={editsLocked}
              onClick={() => selectModelSource("detected")}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-all hover:bg-white/5 hover:text-white"
            >
              Use detected
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
              2. Credentials
            </div>
            <div className="text-base font-semibold text-white">
              {detectedMode
                ? "Baseline key status"
                : customMode
                  ? "Provider key for this run"
                  : "Managed by the selected model source"}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>
              Status: <span className="text-slate-200">{keyStatusLabel}</span>
            </div>
          </div>
        </div>

        {customMode ? (
          <>
            <label className="block mb-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2 block">
                API key (for this run only)
              </span>
              <input
                type="password"
                autoComplete="off"
                value={replayApiKey}
                disabled={editsLocked}
                onChange={e => {
                  if (editsLocked) return;
                  const v = e.target.value;
                  setReplayApiKey?.(v);
                  if (v.trim()) setReplayUserApiKeyId?.(null);
                }}
                placeholder="Paste provider API key"
                className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
              />
            </label>
            <div className="mb-3 rounded-xl border border-white/10 bg-[#0a0c10]/80 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">
                Save key for Release Gate (optional)
              </div>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Keys registered in Live View apply to Detected mode. To reuse a key in Custom
                without pasting each time, save it here.
              </p>
              <input
                type="text"
                name="release-gate-saved-key-label"
                autoComplete="off"
                value={rgSaveLabel}
                disabled={editsLocked}
                onChange={e => setRgSaveLabel(e.target.value)}
                placeholder="Optional label (e.g. staging)"
                className="mb-2 w-full max-w-md rounded-lg border border-white/10 bg-[#0a0c10] px-3 py-2 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50"
              />
              <button
                type="button"
                disabled={editsLocked || !replayApiKey.trim() || rgSaveBusy || !projectId}
                onClick={() => void saveRgKeyFromPaste()}
                className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {rgSaveBusy ? "Saving..." : "Save pasted key to project"}
              </button>
              {rgSavedKeysForProvider.length > 0 ? (
                <ul className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  {rgSavedKeysForProvider.map(k => {
                    const selected = replayUserApiKeyId === k.id && !replayApiKey.trim();
                    return (
                      <li
                        key={k.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300"
                      >
                        <span className="font-mono text-[11px] text-slate-400">
                          {(k.name || "Saved key").replace(/^\[RG\]\s*/, "")}
                          {selected ? (
                            <span className="ml-2 text-fuchsia-300">in use for this run</span>
                          ) : null}
                        </span>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            disabled={editsLocked}
                            onClick={() => {
                              setReplayApiKey?.("");
                              setReplayUserApiKeyId?.(k.id);
                            }}
                            className="rounded border border-white/15 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
                          >
                            Use for run
                          </button>
                          <button
                            type="button"
                            disabled={editsLocked || rgDeleteBusyId === k.id}
                            onClick={() => void deleteRgSavedKey(k.id)}
                            className="rounded border border-rose-500/30 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                          >
                            {rgDeleteBusyId === k.id ? "Deleting..." : "Delete"}
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </>
        ) : null}

        {hostedMode ? (
          <div className="rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-300">
            Credential changes are not available in hosted mode from this section.
          </div>
        ) : null}

        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-xs leading-relaxed",
            keyStatusToneClasses
          )}
        >
          {keyStatusText}
          {missingProviderKeyDetails.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {missingProviderKeyDetails.map(detail => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-sm">
        <div className="mb-2 block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
          3. System prompt
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
          className="min-h-[112px] w-full flex-1 rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={editsLocked || !isSystemPromptOverridden}
            onClick={handleResetSystemPrompt}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset to node default
          </button>
          <div className="text-[11px] text-slate-500">
            {isSystemPromptOverridden ? "Override active" : "Using node default"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
              4. Pass rules
            </div>
            <div className="text-base font-semibold text-white">Release Gate thresholds</div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>
              Fail max:{" "}
              <span className="text-slate-200">
                {(normalizedThresholds.failRateMax * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-0.5">
              Flaky max:{" "}
              <span className="text-slate-200">
                {(normalizedThresholds.flakyRateMax * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          {Object.entries(REPLAY_THRESHOLD_PRESETS).map(([presetId, preset]) => (
            <button
              key={presetId}
              type="button"
              disabled={editsLocked}
              onClick={() => {
                if (editsLocked) return;
                setThresholdPreset?.(presetId as ReleaseGateConfigThresholdPreset);
                setFailRateMax?.(preset.failRateMax);
                setFlakyRateMax?.(preset.flakyRateMax);
              }}
              className={clsx(
                "rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-all",
                thresholdPreset === presetId
                  ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100"
                  : "border-white/10 bg-[#0a0c10] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {thresholdPreset === "custom" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                Fail max (%)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={editsLocked}
                value={(normalizedThresholds.failRateMax * 100).toFixed(0)}
                onChange={e => {
                  if (editsLocked) return;
                  const parsed = Number(e.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setFailRateMax?.(parsed / 100);
                }}
                className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                Flaky max (%)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={editsLocked}
                value={(normalizedThresholds.flakyRateMax * 100).toFixed(0)}
                onChange={e => {
                  if (editsLocked) return;
                  const parsed = Number(e.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setFlakyRateMax?.(parsed / 100);
                }}
                className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50"
              />
            </label>
          </div>
        ) : null}
      </div>
    </>
  );
}


