"use client";

import React, { memo } from "react";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { ReleaseGateMap } from "@/components/release-gate/ReleaseGateMap";
import { ReleaseGateExpandedView } from "./ReleaseGateExpandedView";
import { ReleaseGateStatusPanel } from "./ReleaseGateStatusPanel";

export type ReleaseGateLayoutGateBodyProps = {
  showGateLoadingState: boolean;
  showGateAccessDeniedState: boolean;
  showGateApiErrorState: boolean;
  showGateEmptyState: boolean;
  viewMode: "map" | "expanded";
  mutateAgents: () => void;
  liveViewHref: string;
  agents: AgentForPicker[];
  agentsLoaded: boolean;
  onSelectAgent: (id: string) => void;
  projectId: number;
  projectName?: string;
};

function ReleaseGateLayoutGateBodyInner({
  showGateLoadingState,
  showGateAccessDeniedState,
  showGateApiErrorState,
  showGateEmptyState,
  viewMode,
  mutateAgents,
  liveViewHref,
  agents,
  agentsLoaded,
  onSelectAgent,
  projectId,
  projectName,
}: ReleaseGateLayoutGateBodyProps) {
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
        title="Access Denied"
        description="You do not have access to this project. Ask a project owner or admin to update your role before using Release Gate."
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
      <ReleaseGateMap
        agents={agents}
        agentsLoaded={agentsLoaded}
        onSelectAgent={onSelectAgent}
        projectId={projectId}
        projectName={projectName}
      />
    );
  }
  return <ReleaseGateExpandedView />;
}

export const ReleaseGateLayoutGateBody = memo(ReleaseGateLayoutGateBodyInner);
ReleaseGateLayoutGateBody.displayName = "ReleaseGateLayoutGateBody";
