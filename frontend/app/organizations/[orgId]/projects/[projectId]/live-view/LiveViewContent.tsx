"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";

import { LiveViewDeletedAgentsTray } from "@/components/live-view/LiveViewDeletedAgentsTray";
import { LiveViewEmptyState } from "@/components/live-view/LiveViewEmptyState";
import {
  LiveViewErrorState,
  LiveViewLoadingState,
} from "@/components/live-view/LiveViewOverlayStates";
import { LiveViewPageLayout } from "@/components/live-view/LiveViewPageLayout";
import type { LiveViewPanelRouteContext } from "@/components/live-view/liveViewPanelContext";
import { LIVE_VIEW_EDGE_TYPES, LIVE_VIEW_NODE_TYPES } from "@/components/live-view/LiveViewFlowShell";
import { LiveViewToolbar } from "@/components/live-view/LiveViewToolbar";
import { LiveViewPanelSnapshotUsage } from "@/components/live-view/LiveViewPanelSnapshotUsage";
import {
  getApiErrorCode,
  getApiErrorMessage,
  getRateLimitInfo,
  isRateLimitError,
  redirectToLogin,
} from "@/lib/api/client";
import {
  getProjectAccessErrorCopy,
} from "@/lib/projectAccess";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import { NodeFocusHandler } from "@/components/shared/NodeFocusHandler";
import { useToast } from "@/components/ToastContainer";
import { ProjectAccessInlineStrip } from "@/components/project-access/ProjectAccessInlineStrip";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import {
  LIVE_VIEW_BASE_POLL_MS,
  LIVE_VIEW_MAX_POLL_MS,
  withLiveViewPollJitter,
} from "./liveViewPolling.constants";
import {
  useLiveViewSseCloseWhenHidden,
  useLiveViewSseLifecycle,
} from "./useLiveViewSseLifecycle";
import { useLiveViewCoreData } from "./useLiveViewCoreData";
import { useLiveViewSseRefs } from "./useLiveViewSseRefs";
import { useLiveViewGraphState } from "./useLiveViewGraphState";
import { useLiveViewAgentsToNodesSync } from "./useLiveViewAgentsToNodesSync";
import { useLiveViewRefreshController } from "./useLiveViewRefreshController";
import { useLiveViewDestructiveActions } from "./useLiveViewDestructiveActions";

const LIVE_VIEW_FLOW_NODE_TYPES = LIVE_VIEW_NODE_TYPES;
const LIVE_VIEW_FLOW_EDGE_TYPES = LIVE_VIEW_EDGE_TYPES;

const ClinicalLog = dynamic(() => import("@/components/live-view/ClinicalLog"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[240px] animate-pulse rounded-2xl bg-white/[0.03]" />,
});
const AgentEvaluationPanel = dynamic(
  () =>
    import("@/components/live-view/AgentEvaluationPanel").then(mod => mod.AgentEvaluationPanel),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-[240px] animate-pulse rounded-2xl bg-white/[0.03]" />,
  }
);
const ClinicalLogDataSection = dynamic(
  () =>
    import("@/components/live-view/ClinicalLogDataSection").then(
      mod => mod.ClinicalLogDataSection
    ),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-[240px] animate-pulse rounded-2xl bg-white/[0.03]" />,
  }
);
const AgentSettingsPanel = dynamic(
  () => import("@/components/live-view/AgentSettingsPanel").then(mod => mod.AgentSettingsPanel),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-[240px] animate-pulse rounded-2xl bg-white/[0.03]" />,
  }
);

export function LiveViewContent() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;
  const rawProjectId = params?.projectId;
  const projectIdStr = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const projectId = projectIdStr ? Number(projectIdStr) : 0;
  const toast = useToast();
  const [agentsPollIntervalMs, setAgentsPollIntervalMs] = useState(() =>
    withLiveViewPollJitter(LIVE_VIEW_BASE_POLL_MS)
  );
  const [agentsPlanError, setAgentsPlanError] = useState<PlanLimitError | null>(null);
  const isPageVisible = usePageVisibility();
  const {
    sseConnected,
    setSseConnected,
    sseRef,
    sseMutateTimerRef,
    sseBackoffUntilRef,
  } = useLiveViewSseRefs();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const {
    project,
    projectSummary,
    org,
    organizations,
    orgProjects,
    agentsData,
    agentsLoading,
    agentsError,
    mutateAgents,
    agentsLastUpdatedAt,
  } = useLiveViewCoreData({
    projectId,
    orgId,
    routerReplace: href => router.replace(href),
    selectedAgentId,
    agentsPollIntervalMs,
    isPageVisible,
    sseConnected,
    sseBackoffUntilRef,
  });
  const [panelTab, setPanelTab] = useState<"logs" | "eval" | "data" | "settings">("logs");

  useLiveViewSseLifecycle({
    projectId,
    isPageVisible,
    mutateAgents,
    setAgentsPollIntervalMs,
    setSseConnected,
    sseRef,
    sseMutateTimerRef,
    sseBackoffUntilRef,
  });

  useLiveViewSseCloseWhenHidden({
    isPageVisible,
    setSseConnected,
    sseRef,
    sseBackoffUntilRef,
  });

  const {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    onEdgesChange,
    fitView,
    resetHistory,
    initializeHistory,
    onAutoLayout,
    undo,
    redo,
    canUndo,
    canRedo,
    isDraggingRef,
    didActuallyDragRef,
  } = useLiveViewGraphState(projectId);

  const allAgents = useMemo(() => {
    const raw = Array.isArray(agentsData?.agents)
      ? agentsData.agents
      : Array.isArray((agentsData as any)?.data?.agents)
        ? (agentsData as any).data.agents
        : [];
    return Array.isArray(raw) ? raw : [];
  }, [agentsData]);

  const agentsList = useMemo(() => {
    return allAgents.filter((a: { is_deleted?: boolean }) => !a.is_deleted);
  }, [allAgents]);

  const deletedAgents = useMemo(() => {
    return allAgents.filter((a: { is_deleted?: boolean }) => a.is_deleted);
  }, [allAgents]);
  const {
    restoringAgentId,
    hardDeletingAgents,
    handleHardDeleteAgents,
    handleRestoreAgent,
  } = useLiveViewDestructiveActions({
    projectId,
    selectedAgentId,
    setSelectedAgentId,
    setPanelTab,
    mutateAgents,
    resetHistory,
    toast,
  });

  useLiveViewAgentsToNodesSync({
    projectId,
    agentsData,
    agentsList,
    selectedAgentId,
    fitView,
    setNodes,
    resetHistory,
    initializeHistory,
    isDraggingRef,
  });

  useLiveViewRefreshController({
    projectId,
    fitView,
    agentsLastUpdatedAt,
    isPageVisible,
    mutateAgents,
  });

  const agentsErrorStatus = Number((agentsError as any)?.response?.status ?? 0);
  const agentsErrorCode = getApiErrorCode(agentsError);
  const agentsRateLimit = getRateLimitInfo(agentsError);
  const agentsRetryAfterSec = agentsRateLimit.retryAfterSec;
  useEffect(() => {
    if (!agentsError || agentsErrorStatus !== 403) {
      setAgentsPlanError(null);
      return;
    }
    const parsed = parsePlanLimitError(agentsError);
    if (parsed && parsed.code === "SNAPSHOT_PLAN_LIMIT_REACHED") {
      setAgentsPlanError(parsed);
    } else {
      setAgentsPlanError(null);
    }
  }, [agentsError, agentsErrorStatus]);
  const showLoadingOverlay = agentsLoading && typeof agentsData === "undefined";
  const showAccessDeniedOverlay = !!agentsError && agentsErrorStatus === 403 && !agentsPlanError;
  const showApiErrorOverlay =
    !!agentsError && agentsErrorStatus !== 401 && !showAccessDeniedOverlay;
  const showEmptyOverlay =
    !showLoadingOverlay &&
    !showAccessDeniedOverlay &&
    !showApiErrorOverlay &&
    agentsList.length === 0;

  useEffect(() => {
    if (agentsErrorStatus !== 401) return;
    redirectToLogin({
      code: agentsErrorCode,
      message: getApiErrorMessage(agentsError),
    });
  }, [agentsError, agentsErrorCode, agentsErrorStatus]);

  useEffect(() => {
    if (!projectId || Number.isNaN(projectId) || projectId <= 0) return;
    if (!agentsError) {
      setAgentsPollIntervalMs(withLiveViewPollJitter(LIVE_VIEW_BASE_POLL_MS));
      return;
    }

    if (isRateLimitError(agentsError)) {
      const retryAfterMs = Math.max(
        LIVE_VIEW_BASE_POLL_MS,
        (agentsRetryAfterSec || 0) * 1000
      );
      setAgentsPollIntervalMs(Math.min(retryAfterMs, LIVE_VIEW_MAX_POLL_MS));
      return;
    }

    setAgentsPollIntervalMs(current => Math.min(current * 2, LIVE_VIEW_MAX_POLL_MS));
  }, [agentsError, agentsRetryAfterSec, projectId]);

  const panelCtx: LiveViewPanelRouteContext = {
    projectId,
    orgId,
    agentId: selectedAgentId || "",
  };
  const resolvedProjectAccess = project ?? projectSummary;
  const liveViewAccessCopy = useMemo(
    () =>
      getProjectAccessErrorCopy({
        featureLabel: "Live View",
        project: resolvedProjectAccess,
        error: agentsError,
      }),
    [resolvedProjectAccess, agentsError]
  );

  return (
    <LiveViewPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      organizations={organizations}
      projects={orgProjects}
      topRailMeta={
        !showLoadingOverlay && !showAccessDeniedOverlay && resolvedProjectAccess ? (
          <ProjectAccessInlineStrip project={resolvedProjectAccess} />
        ) : null
      }
      rightPanel={
        <RailwaySidePanel
          title={selectedAgentId || "Agent Diagnostics"}
          headerActions={selectedAgentId ? <LiveViewPanelSnapshotUsage /> : undefined}
          isOpen={!!selectedAgentId}
          width={760}
          contentClassName="h-0 min-h-0"
          contentScrollable={false}
          onClose={() => {
            setSelectedAgentId(null);
            setPanelTab("logs");
          }}
          tabs={[
            { id: "logs", label: "Live Logs" },
            { id: "eval", label: "Evaluation" },
            { id: "data", label: "Saved Data" },
            { id: "settings", label: "Settings" },
          ]}
          activeTab={panelTab}
          onTabChange={id => setPanelTab(id as "logs" | "eval" | "data" | "settings")}
        >
          {panelTab === "logs" ? (
            <ClinicalLog
              {...panelCtx}
              onLogsMutated={() => mutateAgents(undefined, true)}
            />
          ) : null}
          {panelTab === "eval" ? (
            <AgentEvaluationPanel projectId={panelCtx.projectId} agentId={panelCtx.agentId} />
          ) : null}
          {panelTab === "data" ? (
            <ClinicalLogDataSection {...panelCtx} />
          ) : null}
          {panelTab === "settings" ? (
            <AgentSettingsPanel
              projectId={panelCtx.projectId}
              agentId={panelCtx.agentId}
              onAgentUpdated={() => void mutateAgents()}
              onAgentDeleted={() => {
                setSelectedAgentId(null);
                setPanelTab("logs");
                void mutateAgents(undefined, true);
              }}
            />
          ) : null}
        </RailwaySidePanel>
      }
    >
      <div className="flex-1 min-h-0 relative bg-[#050B08] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute -left-[25%] top-1/2 -translate-y-1/2 w-[70%] h-[140%] bg-emerald-500/14 rounded-full blur-[180px]" />
          <div className="absolute -right-[25%] top-1/2 -translate-y-1/2 w-[70%] h-[140%] bg-teal-400/10 rounded-full blur-[180px]" />
          <div className="absolute inset-x-0 bottom-[-40%] h-[80%] bg-emerald-500/12 rounded-full blur-[170px]" />
        </div>

        {showLoadingOverlay && <LiveViewLoadingState />}
        {showAccessDeniedOverlay && (
          <LiveViewErrorState
            title={liveViewAccessCopy.title}
            description={liveViewAccessCopy.description}
            onRetry={() => void mutateAgents()}
          />
        )}
        {showApiErrorOverlay && (
          <LiveViewErrorState
            title={isRateLimitError(agentsError) ? "Live View Busy" : "Unable to Load Agents"}
            description={
              isRateLimitError(agentsError)
                ? `Live View is temporarily throttled. Updates will resume automatically${agentsRateLimit.retryAfterSec ? ` in about ${agentsRateLimit.retryAfterSec} seconds` : " shortly"}. You can also retry now.`
                : "We could not reach the Live View API right now. Please retry in a few seconds. If the problem continues, check backend health and network connectivity."
            }
            onRetry={() => void mutateAgents()}
          />
        )}
        {showEmptyOverlay && <LiveViewEmptyState projectId={projectId} />}
        {!showLoadingOverlay && !showAccessDeniedOverlay && !showApiErrorOverlay && (
          <LiveViewDeletedAgentsTray
            agents={deletedAgents}
            restoringAgentId={restoringAgentId}
            onRestore={handleRestoreAgent}
            onHardDelete={handleHardDeleteAgents}
            hardDeleting={hardDeletingAgents}
          />
        )}
        <div className="absolute bottom-10 left-10 z-0 pointer-events-none select-none opacity-20">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">
              Pluvian Agent Monitoring Center
            </span>
            <span className="text-[8px] font-bold text-slate-700 uppercase tracking-widest font-mono">
              Real-time Pulse HUD / PROJECT: {project?.name || "LIVE_HUD"}
            </span>
          </div>
        </div>

        <LiveViewToolbar
          onUndo={undo}
          onRedo={redo}
          onAutoLayout={onAutoLayout}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <NodeFocusHandler selectedNodeId={selectedAgentId} isPanelOpen={!!selectedAgentId} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={LIVE_VIEW_FLOW_NODE_TYPES}
          edgeTypes={LIVE_VIEW_FLOW_EDGE_TYPES}
          onNodeDragStart={() => {
            isDraggingRef.current = true;
          }}
          onNodeDragStop={() => {
            setTimeout(() => {
              isDraggingRef.current = false;
              didActuallyDragRef.current = false;
            }, 0);
          }}
          onNodeClick={(_, node) => {
            if (didActuallyDragRef.current) return;
            setSelectedAgentId(String(node.id));
          }}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={!selectedAgentId}
          zoomOnScroll={!selectedAgentId}
          zoomOnDoubleClick={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.5}
            color="rgba(110, 231, 183, 0.55)"
          />
        </ReactFlow>
      </div>
    </LiveViewPageLayout>
  );
}
