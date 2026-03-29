"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { API_URL } from "@/lib/api/client";

import {
  LIVE_VIEW_BASE_POLL_MS,
  LIVE_VIEW_MAX_POLL_MS,
  LIVE_VIEW_SSE_MUTATE_DEBOUNCE_MS,
  LIVE_VIEW_SSE_POLL_BACKOFF_MS,
  withLiveViewPollJitter,
} from "./liveViewPolling.constants";

type MutateAgents = () => void | Promise<unknown>;

/**
 * EventSource for Live View + debounced `mutateAgents` on `agents_changed`.
 * Tab hidden: close stream (separate effect below).
 */
export function useLiveViewSseLifecycle(options: {
  projectId: number;
  isPageVisible: boolean;
  mutateAgents: MutateAgents;
  setAgentsPollIntervalMs: Dispatch<SetStateAction<number>>;
  setSseConnected: Dispatch<SetStateAction<boolean>>;
  sseRef: MutableRefObject<EventSource | null>;
  sseMutateTimerRef: MutableRefObject<number | null>;
  sseBackoffUntilRef: MutableRefObject<number>;
}) {
  const {
    projectId,
    isPageVisible,
    mutateAgents,
    setAgentsPollIntervalMs,
    setSseConnected,
    sseRef,
    sseMutateTimerRef,
    sseBackoffUntilRef,
  } = options;

  useEffect(() => {
    if (!projectId || Number.isNaN(projectId) || projectId <= 0) return;
    if (!isPageVisible) return;
    if (sseRef.current) return;

    try {
      const url = `${API_URL}/api/v1/projects/${projectId}/live-view/stream`;
      const es = new EventSource(url, { withCredentials: true });
      sseRef.current = es;

      const cleanup = () => {
        if (sseMutateTimerRef.current) {
          window.clearTimeout(sseMutateTimerRef.current);
          sseMutateTimerRef.current = null;
        }
        try {
          es.close();
        } catch {
          /* ignore */
        }
        sseRef.current = null;
        setSseConnected(false);
      };

      es.addEventListener("connected", () => {
        setSseConnected(true);
        setAgentsPollIntervalMs(withLiveViewPollJitter(LIVE_VIEW_BASE_POLL_MS));
      });

      es.addEventListener("agents_changed", () => {
        if (sseMutateTimerRef.current) {
          window.clearTimeout(sseMutateTimerRef.current);
        }
        sseMutateTimerRef.current = window.setTimeout(() => {
          sseMutateTimerRef.current = null;
          void mutateAgents();
        }, LIVE_VIEW_SSE_MUTATE_DEBOUNCE_MS);
      });

      es.onerror = () => {
        setSseConnected(false);
        sseBackoffUntilRef.current = Date.now() + LIVE_VIEW_SSE_POLL_BACKOFF_MS;
        setAgentsPollIntervalMs(LIVE_VIEW_MAX_POLL_MS);
      };

      return cleanup;
    } catch {
      setSseConnected(false);
      sseBackoffUntilRef.current = Date.now() + LIVE_VIEW_SSE_POLL_BACKOFF_MS;
      setAgentsPollIntervalMs(LIVE_VIEW_MAX_POLL_MS);
      return;
    }
  }, [
    isPageVisible,
    mutateAgents,
    projectId,
    setAgentsPollIntervalMs,
    setSseConnected,
    sseBackoffUntilRef,
    sseMutateTimerRef,
    sseRef,
  ]);
}

/** Close SSE when tab is hidden to reduce server load. */
export function useLiveViewSseCloseWhenHidden(options: {
  isPageVisible: boolean;
  setSseConnected: Dispatch<SetStateAction<boolean>>;
  sseRef: MutableRefObject<EventSource | null>;
  sseBackoffUntilRef: MutableRefObject<number>;
}) {
  const { isPageVisible, setSseConnected, sseRef, sseBackoffUntilRef } = options;

  useEffect(() => {
    if (isPageVisible) return;
    if (!sseRef.current) return;
    try {
      sseRef.current.close();
    } catch {
      /* ignore */
    }
    sseRef.current = null;
    setSseConnected(false);
    sseBackoffUntilRef.current = Date.now() + LIVE_VIEW_SSE_POLL_BACKOFF_MS;
  }, [isPageVisible, setSseConnected, sseBackoffUntilRef, sseRef]);
}
