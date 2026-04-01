"use client";

import React, { memo, useMemo } from "react";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { ReleaseGateMap } from "@/components/release-gate/ReleaseGateMap";
import { ProjectAccessContextBanner } from "@/components/project-access/ProjectAccessContextBanner";
import { ReleaseGateExpandedView } from "./ReleaseGateExpandedView";
import { ReleaseGateStatusPanel } from "./ReleaseGateStatusPanel";
import { getProjectAccessErrorCopy, type AccessAwareProject } from "@/lib/projectAccess";

export type ReleaseGateLayoutGateBodyProps = {
  showGateLoadingState: boolean;
  showGateAccessDeniedState: boolean;
  showGateApiErrorState: boolean;
  showGateEmptyState: boolean;
  agentsError: unknown;
  viewMode: "map" | "expanded";
  mutateAgents: () => void;
  liveViewHref: string;
  agents: AgentForPicker[];
  agentsLoaded: boolean;
  onSelectAgent: (id: string) => void;
  projectId: number;
  projectName?: string;
  projectAccess?: AccessAwareProject;
};

function ReleaseGateLayoutGateBodyInner({
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
  onSelectAgent,
  projectId,
  projectName,
  projectAccess,
}: ReleaseGateLayoutGateBodyProps) {
  const releaseGateAccessCopy = useMemo(
    () =>
      getProjectAccessErrorCopy({
        featureLabel: "Release Gate",
        project: projectAccess,
        error: agentsError,
      }),
    [agentsError, projectAccess]
  );

  if (showGateLoadingState) {
    return (
      <ReleaseGateStatusPanel
        title="Loading Release Gate"
        description="Fetching agents and release history for this project..."
      />
    );
  }
  if (showGateAccessDeniedState) {
    return (
      <ReleaseGateStatusPanel
        title={releaseGateAccessCopy.title}
        description={releaseGateAccessCopy.description}
        tone="warning"
        primaryActionLabel="Retry"
        onPrimaryAction={() => void mutateAgents()}
      />
    );
  }
  if (showGateApiErrorState) {
    return (
      <ReleaseGateStatusPanel
        title="Unable to Load Release Gate"
        description="We could not reach the Release Gate API right now. Retry in a few seconds. If this keeps happening, check backend health and network connectivity."
        tone="danger"
        primaryActionLabel="Retry"
        onPrimaryAction={() => void mutateAgents()}
      />
    );
  }
  if (showGateEmptyState) {
    return (
      <ReleaseGateStatusPanel
        title="No Baseline Data Yet"
        description={
          <div className="space-y-2">
            <p>Release Gate needs baseline snapshots before it can compare a candidate model.</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>Open Live View and send at least one real or test request.</li>
              <li>Select baseline snapshots from Live Logs or Saved Data.</li>
              <li>Return here to configure candidate overrides and run validation.</li>
            </ol>
          </div>
        }
        tone="warning"
        primaryActionLabel="Go to Live View"
        primaryHref={liveViewHref}
      />
    );
  }
  if (viewMode === "map") {
    return (
      <div className="relative h-full">
        {projectAccess ? (
          <div className="absolute left-6 top-[92px] z-30 max-w-[430px]">
            <ProjectAccessContextBanner project={projectAccess} variant="compact" />
          </div>
        ) : null}
        <ReleaseGateMap
          agents={agents}
          agentsLoaded={agentsLoaded}
          onSelectAgent={onSelectAgent}
          projectId={projectId}
          projectName={projectName}
        />
      </div>
    );
  }
  return (
    <div className="relative h-full">
      {projectAccess ? (
        <div className="absolute left-6 top-[92px] z-30 max-w-[430px]">
          <ProjectAccessContextBanner project={projectAccess} variant="compact" />
        </div>
      ) : null}
      <ReleaseGateExpandedView />
    </div>
  );
}

export const ReleaseGateLayoutGateBody = memo(ReleaseGateLayoutGateBodyInner);
ReleaseGateLayoutGateBody.displayName = "ReleaseGateLayoutGateBody";
