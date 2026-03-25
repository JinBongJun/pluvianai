"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
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
import { liveViewAPI } from "@/lib/api";
import {
  getApiErrorCode,
  getApiErrorMessage,
  getRateLimitInfo,
  isRateLimitError,
  redirectToLogin,
} from "@/lib/api/client";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import { NodeFocusHandler } from "@/components/shared/NodeFocusHandler";
import { ClinicalLog } from "@/components/live-view/ClinicalLog";
import { AgentEvaluationPanel } from "@/components/live-view/AgentEvaluationPanel";
import { ClinicalLogDataSection } from "@/components/live-view/ClinicalLogDataSection";
import { AgentSettingsPanel } from "@/components/live-view/AgentSettingsPanel";
import { useToast } from "@/components/ToastContainer";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import {
  LIVE_VIEW_BASE_POLL_MS,
  LIVE_VIEW_MAX_POLL_MS,
} from "./liveViewPolling.constants";
import {
  useLiveViewSseCloseWhenHidden,
  useLiveViewSseLifecycle,
} from "./useLiveViewSseLifecycle";
import { useLiveViewCoreData } from "./useLiveViewCoreData";
import { useLiveViewSseRefs } from "./useLiveViewSseRefs";
import { loadLvPositions } from "./liveViewGraphLayout";
import {
  mapAgentsToLiveViewNodes,
  type LiveViewAgentRow,
} from "./mapAgentsToLiveViewNodes";
import { useLiveViewGraphState } from "./useLiveViewGraphState";

export function LiveViewContent() {
  const params = useParams();
  const router = useRouter();
  const nodeTypes = useMemo(() => LIVE_VIEW_NODE_TYPES, []);
  const edgeTypes = useMemo(() => LIVE_VIEW_EDGE_TYPES, []);
  const orgId = params?.orgId as string;
  const rawProjectId = params?.projectId;
  const projectIdStr = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const projectId = projectIdStr ? Number(projectIdStr) : 0;
  const toast = useToast();
  const [agentsPollIntervalMs, setAgentsPollIntervalMs] = useState(LIVE_VIEW_BASE_POLL_MS);
  const [agentsPlanError, setAgentsPlanError] = useState<PlanLimitError | null>(null);
  const isPageVisible = usePageVisibility();
  const wasPageVisibleRef = useRef(isPageVisible);
  const {
    sseConnected,
    setSseConnected,
    sseRef,
    sseMutateTimerRef,
    sseBackoffUntilRef,
  } = useLiveViewSseRefs();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { project, org, agentsData, agentsLoading, agentsError, mutateAgents } = useLiveViewCoreData({
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
  const [restoringAgentId, setRestoringAgentId] = useState<string | null>(null);
  const [hardDeletingAgents, setHardDeletingAgents] = useState(false);

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
    setHistory,
    setHistoryIndex,
    onAutoLayout,
    undo,
    redo,
    canUndo,
    canRedo,
    isDraggingRef,
    didActuallyDragRef,
    dragEndCounter,
    setDragEndCounter,
  } = useLiveViewGraphState(projectId);

  const prevAgentIdsRef = useRef<Set<string>>(new Set());
  const agentsSyncProjectIdRef = useRef<number | null>(null);

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

  const handleHardDeleteAgents = async (agentIds: string[]) => {
    if (!projectId || Number.isNaN(projectId) || agentIds.length === 0) return;
    const confirmed = window.confirm(
      `Permanently purge ${agentIds.length} deleted node(s) and their Live View data? This action cannot be undone.`
    );
    if (!confirmed) return;

    setHardDeletingAgents(true);
    try {
      const result = await liveViewAPI.hardDeleteAgents(projectId, agentIds);
      if (selectedAgentId && agentIds.includes(selectedAgentId)) {
        setSelectedAgentId(null);
        setPanelTab("logs");
      }
      await mutateAgents(undefined, true);
      setHistory([]);
      setHistoryIndex(-1);
      const deletedSnapshots = Number(result?.deleted_snapshots ?? 0);
      toast.showToast(
        agentIds.length === 1
          ? `Permanently purged 1 deleted node${deletedSnapshots > 0 ? ` and ${deletedSnapshots} log${deletedSnapshots === 1 ? "" : "s"}` : ""}.`
          : `Permanently purged ${agentIds.length} deleted nodes${deletedSnapshots > 0 ? ` and ${deletedSnapshots} logs` : ""}.`,
        "success"
      );
    } catch (error: any) {
      const msg =
        error?.response?.data?.detail ||
        "Failed to permanently delete nodes. Please try again.";
      toast.showToast(msg, "error");
    } finally {
      setHardDeletingAgents(false);
    }
  };

  useEffect(() => {
    if (typeof agentsData === "undefined") return;

    if (agentsSyncProjectIdRef.current !== projectId) {
      agentsSyncProjectIdRef.current = projectId;
      prevAgentIdsRef.current = new Set();
    }

    if (agentsList.length === 0) {
      prevAgentIdsRef.current = new Set();
      setHistory([]);
      setHistoryIndex(-1);
      setNodes([]);
      return;
    }

    const saved = loadLvPositions(projectId);
    const currentAgentIds = new Set(agentsList.map((a: any) => String(a.agent_id)));
    const prevAgentIds = prevAgentIdsRef.current;
    if (prevAgentIds.size > 0) {
      const sameAgentSet =
        prevAgentIds.size === currentAgentIds.size &&
        Array.from(currentAgentIds).every(id => prevAgentIds.has(id));
      if (!sameAgentSet) {
        setHistory([]);
        setHistoryIndex(-1);
      }
    }
    const hasNewAgents =
      prevAgentIds.size > 0 &&
      Array.from(currentAgentIds).some(id => !prevAgentIds.has(id));
    const firstAgentPopulation =
      prevAgentIds.size === 0 && currentAgentIds.size > 0;
    prevAgentIdsRef.current = currentAgentIds;

    setNodes(currentNodes => {
      const updatedNodes = mapAgentsToLiveViewNodes({
        agentsList: agentsList as LiveViewAgentRow[],
        selectedAgentId,
        currentNodes,
        saved,
      });

      setHistory(prevHist => {
        if (prevHist.length === 0 && updatedNodes.length > 0) {
          queueMicrotask(() => setHistoryIndex(0));
          return [updatedNodes.map(n => ({ ...n, position: { ...n.position } }))];
        }
        return prevHist;
      });

      return updatedNodes;
    });

    if (
      (hasNewAgents || firstAgentPopulation) &&
      !isDraggingRef.current &&
      !selectedAgentId
    ) {
      setTimeout(() => fitView({ duration: 600, padding: 0.2 }), 50);
    }
  }, [
    agentsData,
    agentsList,
    selectedAgentId,
    projectId,
    fitView,
    setHistory,
    setHistoryIndex,
    setNodes,
  ]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes(current =>
      current.map(n => ({
        ...n,
        selected: n.id === selectedAgentId,
        data: {
          ...n.data,
          blur: !!selectedAgentId && n.id !== selectedAgentId,
        },
      }))
    );
  }, [selectedAgentId, setNodes, dragEndCounter]);

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
      setAgentsPollIntervalMs(LIVE_VIEW_BASE_POLL_MS);
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

  useEffect(() => {
    if (!projectId || Number.isNaN(projectId) || projectId <= 0) return;
    const becameVisible = !wasPageVisibleRef.current && isPageVisible;
    wasPageVisibleRef.current = isPageVisible;
    if (!becameVisible) return;
    void mutateAgents();
  }, [isPageVisible, mutateAgents, projectId]);

  const handleRestoreAgent = useCallback(
    async (agentId: string) => {
      if (!projectId || !agentId) return;
      setRestoringAgentId(agentId);
      try {
        await liveViewAPI.restoreAgent(projectId, agentId);
        await mutateAgents(undefined, true);
        setSelectedAgentId(agentId);
        setPanelTab("logs");
        toast.showToast("Node restored to Live View.", "success");
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.showToast(typeof msg === "string" ? msg : "Failed to restore node.", "error");
      } finally {
        setRestoringAgentId(null);
      }
    },
    [mutateAgents, projectId, toast]
  );

  const panelCtx: LiveViewPanelRouteContext = {
    projectId,
    orgId,
    agentId: selectedAgentId || "",
  };

  return (
    <LiveViewPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      rightPanel={
        <RailwaySidePanel
          title={selectedAgentId || "Agent Diagnostics"}
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

        {agentsPlanError && (
          <div className="absolute left-4 right-4 top-4 z-20">
            <PlanLimitBanner {...agentsPlanError} context="snapshots" />
          </div>
        )}
        {showLoadingOverlay && <LiveViewLoadingState />}
        {showAccessDeniedOverlay && (
          <LiveViewErrorState
            title="Access Denied"
            description="You do not have access to this project. Ask a project owner or admin to update your role."
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
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDragStart={() => {
            isDraggingRef.current = true;
          }}
          onNodeDragStop={() => {
            setTimeout(() => {
              isDraggingRef.current = false;
              didActuallyDragRef.current = false;
              setDragEndCounter(c => c + 1);
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
