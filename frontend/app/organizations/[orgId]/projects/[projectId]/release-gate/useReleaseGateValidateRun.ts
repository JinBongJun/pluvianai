"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReleaseGateResult } from "@/lib/api";
import { releaseGateAPI } from "@/lib/api";
import {
  getApiErrorCode,
  getApiErrorMessage,
  getRateLimitInfo,
  isRateLimitError,
  redirectToLogin,
} from "@/lib/api/client";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import {
  describeMissingProviderKeys,
  normalizeReplayProvider,
  validateCustomModelForProvider,
  type ReplayProvider,
} from "./releaseGatePageContent.lib";
import {
  buildReleaseGateValidateAsyncPayload,
  type ReleaseGateValidateAsyncPayloadInput,
} from "./releaseGateValidateAsyncPayload";

/** Fewer, slightly slower polls during cancel to reduce job_poll 429s. */
const CANCEL_BURST_POLLS = 3;
const CANCEL_BURST_INTERVAL_MS = 2000;
/** Slower baseline polling to stay under release_gate_job_poll limits. */
const BASE_POLL_INTERVAL_MS = 4000;
const FAST_POLL_INTERVAL_MS = 3200;
const FAST_POLL_WINDOW_MS = 2500;
/** Spread concurrent tabs / clients so polls do not align on the same second. */
const POLL_JITTER_MS_MAX = 900;

function pollDelayMs(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * POLL_JITTER_MS_MAX);
}

export type ReleaseGateValidateRunDeps = ReleaseGateValidateAsyncPayloadInput & {
  canValidate: boolean;
  keyBlocked: boolean;
  keyRegistrationMessage: string;
};

export function createDefaultValidateRunDeps(): ReleaseGateValidateRunDeps {
  return {
    canValidate: false,
    keyBlocked: true,
    keyRegistrationMessage: "",
    modelSource: "detected",
    modelOverrideEnabled: false,
    newModel: "",
    replayProvider: "openai",
    failRateMax: 0,
    flakyRateMax: 0,
    agentId: "",
    runSnapshotIds: [],
    runDatasetIds: [],
    requestBody: {},
    requestSystemPrompt: "",
    toolsList: [],
    requestBodyOverrides: {},
    requestBodyOverridesBySnapshotId: {},
    toolContextMode: "recorded",
    toolContextScope: "per_snapshot",
    toolContextGlobalText: "",
    toolContextBySnapshotId: {},
    repeatRuns: 1,
    replayUserApiKeyId: null,
    replayApiKey: "",
    replayModelMode: "hosted",
  };
}

export function useReleaseGateValidateRun(options: {
  projectId: number;
  depsRef: MutableRefObject<ReleaseGateValidateRunDeps>;
  mutateHistoryRef: MutableRefObject<(() => unknown) | undefined>;
}) {
  const { projectId, depsRef, mutateHistoryRef } = options;

  const [isValidating, setIsValidating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [result, setResult] = useState<ReleaseGateResult | null>(null);
  const [error, setError] = useState("");
  const [planError, setPlanError] = useState<PlanLimitError | null>(null);
  const [runValidateCooldownUntilMs, setRunValidateCooldownUntilMs] = useState(0);

  const cancelRequestedRef = useRef(false);
  const pollNowRef = useRef<null | (() => void)>(null);
  const cancelBurstRemainingRef = useRef(0);

  useEffect(() => {
    cancelRequestedRef.current = cancelRequested;
    if (cancelRequested) {
      cancelBurstRemainingRef.current = Math.max(
        cancelBurstRemainingRef.current,
        CANCEL_BURST_POLLS
      );
    } else {
      cancelBurstRemainingRef.current = 0;
    }
  }, [cancelRequested]);

  useEffect(() => {
    if (runValidateCooldownUntilMs <= Date.now()) return;
    const ms = Math.max(0, runValidateCooldownUntilMs - Date.now());
    const id = window.setTimeout(() => setRunValidateCooldownUntilMs(0), ms);
    return () => window.clearTimeout(id);
  }, [runValidateCooldownUntilMs]);

  const clearRunUi = useCallback(() => {
    setResult(null);
    setError("");
    setActiveJobId(null);
    setCancelRequested(false);
    setIsValidating(false);
    cancelRequestedRef.current = false;
  }, []);

  const handleCancelActiveJob = useCallback(async () => {
    if (!projectId || isNaN(projectId)) return;
    const jobId = String(activeJobId || "").trim();
    if (!cancelRequestedRef.current) {
      cancelRequestedRef.current = true;
      setCancelRequested(true);
    }
    cancelBurstRemainingRef.current = Math.max(cancelBurstRemainingRef.current, CANCEL_BURST_POLLS);
    if (!jobId) return;
    try {
      await releaseGateAPI.cancelJob(projectId, jobId);
      if (pollNowRef.current) pollNowRef.current();
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail?.message ||
        e?.response?.data?.detail ||
        e?.message ||
        "Failed to cancel run.";
      setError(String(msg));
    }
  }, [projectId, activeJobId]);

  useEffect(() => {
    if (!activeJobId) return;
    if (!projectId || isNaN(projectId)) return;
    let cancelled = false;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const finalize = async (
      status: "succeeded" | "failed" | "canceled",
      finalResult: any,
      finalJob: any
    ) => {
      if (cancelled) return;
      if (status === "succeeded") {
        setResult(finalResult);
        setError("");
        void mutateHistoryRef.current?.();
      } else if (status === "canceled") {
        setResult(null);
        setError("Run canceled.");
      } else {
        const jobError = finalJob?.error_detail as any;
        setResult(null);
        setError(
          String(jobError?.message || jobError?.detail || "Release Gate validation failed.")
        );
      }
      setActiveJobId(null);
      setIsValidating(false);
      setCancelRequested(false);
    };

    const run = async () => {
      let backoffMs = BASE_POLL_INTERVAL_MS;
      const maxBackoffMs = 12000;
      let consecutiveErrors = 0;
      const pollStartedAtMs = Date.now();
      /** After a 429, do not use the fast-poll window (it would ignore Retry-After backoff). */
      let suppressFastPollUntilMs = 0;
      let shown429Notice = false;
      let wakeRequested = false;
      let wakeFn: (() => void) | null = null;
      const waitForWake = () =>
        new Promise<void>(resolve => {
          wakeFn = resolve;
        });
      pollNowRef.current = () => {
        wakeRequested = true;
        if (wakeFn) {
          const fn = wakeFn;
          wakeFn = null;
          fn();
        }
      };
      const nextDelayMs = () => {
        if (cancelRequestedRef.current && cancelBurstRemainingRef.current > 0) {
          return CANCEL_BURST_INTERVAL_MS;
        }
        const now = Date.now();
        if (now < suppressFastPollUntilMs) {
          return Math.max(backoffMs, BASE_POLL_INTERVAL_MS);
        }
        if (now - pollStartedAtMs <= FAST_POLL_WINDOW_MS) {
          return FAST_POLL_INTERVAL_MS;
        }
        return backoffMs;
      };
      const consumeDelayBudget = () => {
        if (cancelRequestedRef.current && cancelBurstRemainingRef.current > 0) {
          cancelBurstRemainingRef.current -= 1;
        }
      };
      while (!cancelled) {
        try {
          const res = await releaseGateAPI.getJob(projectId, activeJobId, 0);
          if (res?.job?.cancel_requested_at && !cancelRequestedRef.current) {
            cancelRequestedRef.current = true;
            setCancelRequested(true);
          }
          const status = String(res?.job?.status || "").toLowerCase();
          if (status === "succeeded" || status === "failed" || status === "canceled") {
            const finalRes = await releaseGateAPI.getJob(projectId, activeJobId, 1);
            const finalStatus = String(finalRes?.job?.status || "").toLowerCase();
            const finalResult = (finalRes as any)?.result ?? null;
            if (
              finalStatus === "succeeded" ||
              finalStatus === "failed" ||
              finalStatus === "canceled"
            ) {
              await finalize(finalStatus, finalResult, finalRes?.job);
              return;
            }
          }
          consecutiveErrors = 0;
          backoffMs = BASE_POLL_INTERVAL_MS;
          shown429Notice = false;
          if (wakeRequested) {
            wakeRequested = false;
            continue;
          }
          const delay = nextDelayMs();
          consumeDelayBudget();
          await Promise.race([sleep(pollDelayMs(delay)), waitForWake()]);
        } catch (e: any) {
          if (cancelled) return;
          const statusCode = e?.response?.status;
          if (statusCode === 429) {
            const rateInfo = getRateLimitInfo(e);
            const retryAfterSec = Math.max(1, rateInfo.retryAfterSec ?? 2);
            if (!shown429Notice && !cancelRequestedRef.current) {
              shown429Notice = true;
              if (rateInfo.bucket === "release_gate_job_poll") {
                setError(`Status polling slowed by server rate limits. Retrying in about ${retryAfterSec}s...`);
              } else {
                setError(`Server is rate limiting requests. Retrying in about ${retryAfterSec}s...`);
              }
            }
            backoffMs = Math.min(
              maxBackoffMs,
              Math.max(BASE_POLL_INTERVAL_MS, retryAfterSec * 1000)
            );
            suppressFastPollUntilMs = Date.now() + Math.max(retryAfterSec * 1000, BASE_POLL_INTERVAL_MS);
            if (wakeRequested) {
              wakeRequested = false;
              continue;
            }
            const delay = nextDelayMs();
            consumeDelayBudget();
            await Promise.race([sleep(pollDelayMs(delay)), waitForWake()]);
            continue;
          }
          consecutiveErrors += 1;
          if (statusCode === 401) {
            redirectToLogin({
              code: getApiErrorCode(e),
              message: getApiErrorMessage(e),
            });
            setError("Session expired. Please log in again.");
            setActiveJobId(null);
            setIsValidating(false);
            return;
          }
          if (statusCode === 403) {
            setError("You do not have access to this project.");
            setActiveJobId(null);
            setIsValidating(false);
            return;
          }
          if (statusCode === 404) {
            setError("Job not found (it may have expired or been deleted).");
            setActiveJobId(null);
            setIsValidating(false);
            setCancelRequested(false);
            return;
          }
          if (consecutiveErrors === 1) {
            if (!cancelRequestedRef.current) setError("Polling delayed (server busy). Retrying…");
          }
          backoffMs = Math.min(Math.max(BASE_POLL_INTERVAL_MS, backoffMs * 2), maxBackoffMs);
          if (wakeRequested) {
            wakeRequested = false;
            continue;
          }
          const delay = nextDelayMs();
          consumeDelayBudget();
          await Promise.race([sleep(pollDelayMs(delay)), waitForWake()]);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      if (pollNowRef.current) pollNowRef.current = null;
    };
  }, [activeJobId, projectId, mutateHistoryRef]);

  const handleValidate = useCallback(async () => {
    const d = depsRef.current;
    const runLockedLocal = isValidating || Boolean(activeJobId);
    if (!projectId || isNaN(projectId) || !d.canValidate || runLockedLocal) return;
    const cooldownUntil = runValidateCooldownUntilMs;
    if (cooldownUntil > Date.now()) {
      const sec = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setError(`Please wait ${sec}s before starting another run (rate limited).`);
      return;
    }
    if (d.keyBlocked) {
      setError(d.keyRegistrationMessage || "Run blocked: required API key is not registered.");
      return;
    }
    if ((d.modelSource === "hosted" || d.modelSource === "custom") && !d.newModel.trim()) {
      setError("Run blocked: select a model for Hosted or enter a model id for Custom (BYOK).");
      return;
    }
    if (d.modelSource === "custom") {
      const modelValidation = validateCustomModelForProvider(d.replayProvider, d.newModel);
      if (!modelValidation.ok) {
        setError(modelValidation.message);
        return;
      }
    }
    setIsValidating(true);
    setCancelRequested(false);
    cancelRequestedRef.current = false;
    setPlanError(null);
    setError("");
    let startedAsyncJob = false;
    try {
      const built = buildReleaseGateValidateAsyncPayload(d);
      if (!built.ok) {
        setError(built.error);
        setIsValidating(false);
        return;
      }
      const jobRes = await releaseGateAPI.validateAsync(projectId, built.payload);
      const jobId = String(jobRes?.job?.id || "").trim();
      if (!jobId) {
        throw new Error("Failed to start Release Gate job.");
      }
      setResult(null);
      setActiveJobId(jobId);
      startedAsyncJob = true;
      if (cancelRequestedRef.current) {
        try {
          await releaseGateAPI.cancelJob(projectId, jobId);
        } catch {
          // ignore
        } finally {
          if (pollNowRef.current) pollNowRef.current();
        }
      }
    } catch (e: any) {
      const parsedPlanError = parsePlanLimitError(e);
      if (parsedPlanError && parsedPlanError.code === "LIMIT_PLATFORM_REPLAY_CREDITS") {
        setPlanError(parsedPlanError);
        setError(
          parsedPlanError.message ||
            "You have used all hosted replay credits for this billing period. Use your own provider key or upgrade your plan for more hosted runs."
        );
        setResult(null);
        return;
      }
      if (isRateLimitError(e)) {
        const rateInfo = getRateLimitInfo(e);
        const retryAfterSec = Math.max(1, rateInfo.retryAfterSec ?? 60);
        setRunValidateCooldownUntilMs(Date.now() + retryAfterSec * 1000);
        if (rateInfo.bucket === "release_gate_validate") {
          setError(
            `Release Gate run requests are temporarily rate-limited. Try again in about ${retryAfterSec}s.`
          );
        } else if (rateInfo.bucket === "release_gate_job_poll") {
          setError(
            `Release Gate is still running, but status polling is being slowed down. Retrying in about ${retryAfterSec}s.`
          );
        } else {
          setError(`Too many requests right now. Please retry in about ${retryAfterSec}s.`);
        }
        setResult(null);
        return;
      }
      const detail = e?.response?.data?.detail;
      const detailObj =
        detail && typeof detail === "object" && !Array.isArray(detail)
          ? (detail as { error_code?: string; missing_provider_keys?: string[]; message?: string })
          : null;
      const missingFromDetail = Array.isArray(detailObj?.missing_provider_keys)
        ? detailObj!.missing_provider_keys
            .map(provider => normalizeReplayProvider(provider))
            .filter((provider): provider is ReplayProvider => Boolean(provider))
        : [];
      const detailMessage =
        detailObj?.message ||
        (Array.isArray(detail)
          ? detail.join(" ")
          : typeof detail === "string"
            ? detail
            : e?.message || "Release Gate validation failed.");
      const errorCode = String(detailObj?.error_code ?? e?.response?.data?.error_code ?? "")
        .trim()
        .toLowerCase();
      if (errorCode === "missing_provider_keys" && missingFromDetail.length > 0) {
        setError(describeMissingProviderKeys(missingFromDetail));
      } else if (
        errorCode === "dataset_agent_mismatch" ||
        errorCode === "dataset_snapshot_agent_mismatch"
      ) {
        setError(
          "Run blocked: selected data includes logs from another agent. Use only Live Logs or Saved Data for this agent."
        );
      } else if (errorCode === "release_gate_requires_pinned_model") {
        setError(
          "Run blocked: Release Gate requires a pinned Anthropic model id for reproducibility (ends with YYYYMMDD)."
        );
      } else if (errorCode === "provider_model_mismatch") {
        setError(
          "Run blocked: selected provider does not match the model id. Pick the matching provider tab or choose a model from that provider."
        );
      } else if (errorCode === "missing_api_key" || /api key/i.test(detailMessage)) {
        setError(
          "Run blocked: required API key is not registered. Open Live View, click the node, then register the key in the Settings tab."
        );
      } else {
        setError(detailMessage);
      }
      setResult(null);
    } finally {
      if (!startedAsyncJob) setIsValidating(false);
    }
  }, [projectId, isValidating, activeJobId, depsRef, runValidateCooldownUntilMs]);

  return {
    isValidating,
    activeJobId,
    cancelRequested,
    result,
    error,
    planError,
    runValidateCooldownUntilMs,
    handleValidate,
    handleCancelActiveJob,
    clearRunUi,
  };
}

/** Keeps validate-async deps fresh on every render (same as `ref.current = { ... }` in the page). */
export function useReleaseGateValidateRunDepsRefSync(
  ref: MutableRefObject<ReleaseGateValidateRunDeps>,
  deps: ReleaseGateValidateRunDeps
): void {
  ref.current = deps;
}
