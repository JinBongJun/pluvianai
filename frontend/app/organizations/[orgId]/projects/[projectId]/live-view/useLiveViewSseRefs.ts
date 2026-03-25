"use client";

import { useRef, useState } from "react";

/**
 * SSE + agents polling coordination state. Instantiate before `useSWR` for agents
 * so `refreshInterval` can read `sseConnected` / `sseBackoffUntilRef`.
 */
export function useLiveViewSseRefs() {
  const [sseConnected, setSseConnected] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const sseMutateTimerRef = useRef<number | null>(null);
  const sseBackoffUntilRef = useRef(0);

  return {
    sseConnected,
    setSseConnected,
    sseRef,
    sseMutateTimerRef,
    sseBackoffUntilRef,
  };
}
