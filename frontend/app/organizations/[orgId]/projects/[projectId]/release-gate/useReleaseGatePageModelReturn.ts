"use client";

import { useMemo } from "react";

import type { ReleaseGateLayoutGateBodyProps } from "./ReleaseGateLayoutGateBody";
import type { ReleaseGateValidateRunContextValue } from "./ReleaseGateValidateRunContext";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";

export type UseReleaseGatePageModelReturnParams = {
  orgId: string;
  projectId: number;
  project: { name?: string } | undefined;
  isValidating: boolean;
  activeJobId: string | null;
  cancelRequested: boolean;
  handleValidate: () => void;
  handleCancelActiveJob: (() => void) | undefined;
  error: string;
  result: ReleaseGateValidateRunContextValue["result"];
  keyBlocked: boolean;
  keyRegistrationMessage: string;
  missingProviderKeyDetails: string[];
  showGateLoadingState: boolean;
  showGateAccessDeniedState: boolean;
  showGateApiErrorState: boolean;
  showGateEmptyState: boolean;
  viewMode: "map" | "expanded";
  mutateAgents: () => unknown;
  agents: AgentForPicker[];
  agentsLoaded: boolean;
  onMapSelectAgent: (id: string) => void;
};

/** Validate-run context, gate body props, and API-key banner slice for {@link useReleaseGatePageModel}. */
export function useReleaseGatePageModelReturn(p: UseReleaseGatePageModelReturnParams) {
  const {
    orgId,
    projectId,
    project,
    isValidating,
    activeJobId,
    cancelRequested,
    handleValidate,
    handleCancelActiveJob,
    error,
    result,
    keyBlocked,
    keyRegistrationMessage,
    missingProviderKeyDetails,
    showGateLoadingState,
    showGateAccessDeniedState,
    showGateApiErrorState,
    showGateEmptyState,
    viewMode,
    mutateAgents,
    agents,
    agentsLoaded,
    onMapSelectAgent,
  } = p;

  const validateRunContextValue = useMemo<ReleaseGateValidateRunContextValue>(
    () => ({
      isValidating,
      activeJobId,
      cancelRequested,
      handleValidate,
      handleCancelActiveJob,
      error,
      result,
    }),
    [
      activeJobId,
      cancelRequested,
      error,
      handleCancelActiveJob,
      handleValidate,
      isValidating,
      result,
    ]
  );

  const liveViewHref = useMemo(
    () =>
      orgId && projectId && !isNaN(projectId)
        ? `/organizations/${encodeURIComponent(orgId)}/projects/${projectId}/live-view`
        : "/organizations",
    [orgId, projectId]
  );

  const gateBodyProps = useMemo(
    (): ReleaseGateLayoutGateBodyProps => ({
      showGateLoadingState,
      showGateAccessDeniedState,
      showGateApiErrorState,
      showGateEmptyState,
      viewMode,
      mutateAgents,
      liveViewHref,
      agents,
      agentsLoaded,
      onSelectAgent: onMapSelectAgent,
      projectId,
      projectName: project?.name,
    }),
    [
      showGateLoadingState,
      showGateAccessDeniedState,
      showGateApiErrorState,
      showGateEmptyState,
      viewMode,
      mutateAgents,
      liveViewHref,
      agents,
      agentsLoaded,
      onMapSelectAgent,
      projectId,
      project?.name,
    ]
  );

  const releaseGateKeysContextValue = useMemo(
    () => ({ keyBlocked, keyRegistrationMessage, missingProviderKeyDetails }),
    [keyBlocked, keyRegistrationMessage, missingProviderKeyDetails]
  );

  return { validateRunContextValue, gateBodyProps, releaseGateKeysContextValue };
}
