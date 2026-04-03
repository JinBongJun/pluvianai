"use client";

import { useEffect, useRef } from "react";

import {
  LABORATORY_REFRESH_EVENT,
  type LaboratoryRefreshDetail,
} from "@/lib/laboratoryLabRefresh";

export function useLiveViewRefreshController(options: {
  projectId: number;
  requestIdleFit: () => void;
  hasSelectedAgent: boolean;
  agentsLastUpdatedAt: number;
  isPageVisible: boolean;
  mutateAgents: (data?: unknown, shouldRevalidate?: boolean) => Promise<unknown>;
}) {
  const { projectId, requestIdleFit, hasSelectedAgent, agentsLastUpdatedAt, isPageVisible, mutateAgents } = options;
  const wasPageVisibleRef = useRef(isPageVisible);

  useEffect(() => {
    if (!projectId || Number.isNaN(projectId) || projectId <= 0) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LaboratoryRefreshDetail>).detail;
      if (!detail || detail.projectId !== projectId) return;
      if (!hasSelectedAgent) {
        requestIdleFit();
      }
    };
    window.addEventListener(LABORATORY_REFRESH_EVENT, handler as EventListener);
    return () => window.removeEventListener(LABORATORY_REFRESH_EVENT, handler as EventListener);
  }, [projectId, requestIdleFit, hasSelectedAgent]);

  useEffect(() => {
    if (!projectId || Number.isNaN(projectId) || projectId <= 0) return;
    const becameVisible = !wasPageVisibleRef.current && isPageVisible;
    wasPageVisibleRef.current = isPageVisible;
    if (!becameVisible) return;
    if (Date.now() - agentsLastUpdatedAt < 15_000) return;
    void mutateAgents();
  }, [agentsLastUpdatedAt, isPageVisible, mutateAgents, projectId]);
}
