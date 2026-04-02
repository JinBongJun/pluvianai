"use client";

import { useMemo } from "react";

import type { ReleaseGateLayoutGateBodyProps } from "./ReleaseGateLayoutGateBody";
import type { ReleaseGateValidateRunContextValue } from "./ReleaseGateValidateRunContext";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import type { OrganizationProject, Project } from "@/lib/api";

export type UseReleaseGatePageModelReturnParams = {
  orgId: string;
  projectId: number;
  project: Project | undefined;
  projectSummary: OrganizationProject | undefined;
  isValidating: boolean;
  runLocked: boolean;
  activeJobId: string | null;
  cancelRequested: boolean;
  cancelLocked: boolean;
  handleValidate: () => void;
  handleCancelActiveJob: (() => void) | undefined;
  error: string;
  result: ReleaseGateValidateRunContextValue["result"];
  completedResults: ReleaseGateValidateRunContextValue["completedResults"];
  hasCompletedResults: boolean;
  dismissResult: (reportId: string) => void;
  keyBlocked: boolean;
  keyIssueBlocked: boolean;
  keyRegistrationMessage: string;
  missingProviderKeyDetails: string[];
  showGateLoadingState: boolean;
  showGateAccessDeniedState: boolean;
  showGateApiErrorState: boolean;
  showGateEmptyState: boolean;
  agentsError: unknown;
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
    projectSummary,
    isValidating,
    runLocked,
    activeJobId,
    cancelRequested,
    cancelLocked,
    handleValidate,
    handleCancelActiveJob,
    error,
    result,
    completedResults,
    hasCompletedResults,
    dismissResult,
    keyBlocked,
    keyIssueBlocked,
    keyRegistrationMessage,
    missingProviderKeyDetails,
    showGateLoadingState,
    showGateAccessDeniedState,
    showGateApiErrorState,
    showGateEmptyState,
    agentsError,
    viewMode,
    mutateAgents,
    agents,
    agentsLoaded,
    onMapSelectAgent,
  } = p;

  const validateRunContextValue = useMemo<ReleaseGateValidateRunContextValue>(
    () => ({
      isValidating,
      runLocked,
      activeJobId,
      cancelRequested,
      cancelLocked,
      handleValidate,
      handleCancelActiveJob,
      error,
      result,
      completedResults,
      hasCompletedResults,
      dismissResult,
    }),
    [
      activeJobId,
      cancelLocked,
      cancelRequested,
      completedResults,
      dismissResult,
      error,
      hasCompletedResults,
      handleCancelActiveJob,
      handleValidate,
      isValidating,
      result,
      runLocked,
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
      agentsError,
      viewMode,
      mutateAgents,
      liveViewHref,
      agents,
      agentsLoaded,
      onSelectAgent: onMapSelectAgent,
      projectId,
      projectName: project?.name,
      projectAccess: project ?? projectSummary,
    }),
    [
      showGateLoadingState,
      showGateAccessDeniedState,
      showGateApiErrorState,
      showGateEmptyState,
      agentsError,
      viewMode,
      mutateAgents,
      liveViewHref,
      agents,
      agentsLoaded,
      onMapSelectAgent,
      projectId,
      project,
      projectSummary,
    ]
  );

  const releaseGateKeysContextValue = useMemo(
    () => ({ keyBlocked, keyIssueBlocked, keyRegistrationMessage, missingProviderKeyDetails }),
    [keyBlocked, keyIssueBlocked, keyRegistrationMessage, missingProviderKeyDetails]
  );

  return { validateRunContextValue, gateBodyProps, releaseGateKeysContextValue };
}
