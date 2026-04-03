"use client";

import React, { useCallback, useEffect, useRef } from "react";
import ReactFlow, {
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { AgentCardNode } from "@/components/live-view/AgentCardNode";
import DrawIOEdge from "@/components/shared/DrawIOEdge";
import { Plus, Minus, Maximize, LayoutGrid, Undo, Redo } from "lucide-react";
import clsx from "clsx";

import {
  LABORATORY_REFRESH_EVENT,
  type LaboratoryRefreshDetail,
} from "@/lib/laboratoryLabRefresh";
import {
  mapAgentsToReleaseGateNodes,
  RG_GRID_SPACING_X,
  RG_GRID_SPACING_Y,
} from "./mapAgentsToReleaseGateNodes";
import {
  loadReleaseGateSavedPositions,
  saveReleaseGatePositions,
} from "./releaseGateMapStorage";
import { createDragAwareNodesChangeHandler } from "@/lib/react-flow/dragAwareNodeChanges";
import { buildGridLayout, syncNodeSelectionState } from "@/lib/react-flow/graphNodes";
import { useGraphHistory } from "@/lib/react-flow/useGraphHistory";
import { useSelectedNodeCenter } from "@/lib/react-flow/useSelectedNodeCenter";

const NODE_TYPES = { agentCard: AgentCardNode };
const EDGE_TYPES = { default: DrawIOEdge };

/** Zoom when a node is selected and centered. */
const FOCUS_ZOOM = 0.95;
const FOCUS_DURATION_MS = 800;
/** Offset in graph coords: positive = node ends up higher on screen. Reduced so node sits below navbar. */
/** Negative = center view above node so node appears lower on screen */
const FOCUS_Y_OFFSET_UP = -1;

function RGMapToolbar({
  onAutoLayout,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const groupBase =
    "flex flex-col bg-[#1C1C1E]/70 backdrop-blur-md border border-[#3A3A3C]/50 shadow-lg rounded-[14px] overflow-hidden relative group transition-all duration-300";
  const btnBase =
    "flex items-center justify-center w-[40px] h-[40px] text-[#8E8E93] hover:text-white hover:bg-white/[0.05] transition-all duration-200 relative z-10";

  return (
    <div className="absolute left-6 top-[180px] z-50 flex flex-col gap-3">
      {/* Auto Layout Button */}
      <div className={groupBase}>
        <button className={btnBase} onClick={onAutoLayout} title="Auto Layout">
          <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Zoom controls */}
      <div className={groupBase}>
        <button className={btnBase} onClick={() => zoomIn({ duration: 300 })}>
          <Plus className="w-[19px] h-[19px]" strokeWidth={1.5} />
        </button>
        <button className={btnBase} onClick={() => zoomOut({ duration: 300 })}>
          <Minus className="w-[20px] h-[20px]" strokeWidth={1.5} />
        </button>
        <button className={btnBase} onClick={() => fitView({ duration: 800 })}>
          <Maximize className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Undo / Redo */}
      <div className={groupBase}>
        <button
          className={clsx(btnBase, !canUndo && "opacity-20 pointer-events-none grayscale")}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <Undo className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <button
          className={clsx(btnBase, !canRedo && "opacity-20 pointer-events-none grayscale")}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <Redo className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function ReleaseGateMapContent({
  agents,
  agentsLoaded = false,
  onSelectAgent,
  projectId,
  projectName,
  selectedNodeId = null,
}: {
  agents: any[];
  agentsLoaded?: boolean;
  onSelectAgent: (agentId: string) => void;
  projectId: number;
  projectName?: string;
  selectedNodeId?: string | null;
}) {
  const { fitView, setCenter } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const {
    commitHistory,
    resetHistory,
    initializeHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useGraphHistory();
  const isDraggingRef = useRef(false);
  const didActuallyDragRef = useRef(false);
  const prevAgentsKeyRef = useRef("");
  const pendingFitAfterNodesRef = useRef(false);
  const pendingRefreshFallbackTimeoutRef = useRef<number | null>(null);
  const suppressSelectedCenterRef = useRef(false);

  const onAutoLayout = () => {
    setNodes(currentNodes => {
      const newNodes = buildGridLayout(currentNodes, {
        spacingX: RG_GRID_SPACING_X,
        spacingY: RG_GRID_SPACING_Y,
      });

      setTimeout(() => {
        commitHistory(newNodes);
        saveReleaseGatePositions(newNodes, { projectId, projectName });
        setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 50);
      }, 0);

      return newNodes;
    });
  };

  const agentsKey = agents?.length
    ? [...agents.map((a: any) => String(a.agent_id))].sort().join(",")
    : "";
  useEffect(() => {
    if (!Array.isArray(agents) || agents.length === 0) {
      if (agentsLoaded) {
        setNodes([]);
        resetHistory();
        prevAgentsKeyRef.current = "";
      }
      return;
    }

    const previousAgentIds = new Set(
      prevAgentsKeyRef.current
        ? prevAgentsKeyRef.current.split(",").map(id => id.trim()).filter(Boolean)
        : []
    );
    const nextAgentIds = new Set(
      agents.map((agent: any) => String(agent?.agent_id ?? "").trim()).filter(Boolean)
    );
    const addedAgentIds = Array.from(nextAgentIds).filter(id => !previousAgentIds.has(id));
    if (prevAgentsKeyRef.current !== "" && prevAgentsKeyRef.current !== agentsKey) {
      resetHistory();
    }
    prevAgentsKeyRef.current = agentsKey;
    if (addedAgentIds.length > 0) {
      pendingFitAfterNodesRef.current = true;
    }

    const saved = loadReleaseGateSavedPositions({ projectId, projectName });

    setNodes(currentNodes => {
      return mapAgentsToReleaseGateNodes({
        agents,
        selectedNodeId,
        currentNodes,
        saved,
      });
    });
  }, [agentsKey, agents, agentsLoaded, selectedNodeId, setNodes, projectId, projectName, resetHistory]);

  // Keep node.selected and blur in sync when selectedNodeId changes (skip during drag to avoid node jump)
  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes(current => syncNodeSelectionState(current, selectedNodeId));
  }, [selectedNodeId, setNodes, isDraggingRef]);

  useSelectedNodeCenter({
    selectedNodeId,
    nodes,
    setCenter,
    zoom: FOCUS_ZOOM,
    durationMs: FOCUS_DURATION_MS,
    offsetY: FOCUS_Y_OFFSET_UP,
    suppressRef: suppressSelectedCenterRef,
  });

  useEffect(() => {
    if (nodes.length === 0 || selectedNodeId) return;
    const t = setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
    }, 150);
    return () => clearTimeout(t);
  }, [nodes, selectedNodeId, fitView]);

  useEffect(() => {
    if (!projectId || Number.isNaN(projectId) || projectId <= 0) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<LaboratoryRefreshDetail>).detail;
      if (!d || d.projectId !== projectId) return;
      pendingFitAfterNodesRef.current = true;
      suppressSelectedCenterRef.current = true;
      if (pendingRefreshFallbackTimeoutRef.current != null) {
        window.clearTimeout(pendingRefreshFallbackTimeoutRef.current);
      }
      pendingRefreshFallbackTimeoutRef.current = window.setTimeout(() => {
        if (!pendingFitAfterNodesRef.current) return;
        pendingFitAfterNodesRef.current = false;
        suppressSelectedCenterRef.current = false;
        fitView({ duration: 800, padding: 0.2 });
      }, 320);
    };
    window.addEventListener(LABORATORY_REFRESH_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(LABORATORY_REFRESH_EVENT, handler as EventListener);
      if (pendingRefreshFallbackTimeoutRef.current != null) {
        window.clearTimeout(pendingRefreshFallbackTimeoutRef.current);
      }
    };
  }, [projectId, fitView]);

  useEffect(() => {
    if (!pendingFitAfterNodesRef.current) return;
    if (nodes.length === 0) return;
    pendingFitAfterNodesRef.current = false;
    if (pendingRefreshFallbackTimeoutRef.current != null) {
      window.clearTimeout(pendingRefreshFallbackTimeoutRef.current);
      pendingRefreshFallbackTimeoutRef.current = null;
    }
    const t = window.setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
      window.setTimeout(() => {
        suppressSelectedCenterRef.current = false;
      }, 0);
    }, 120);
    return () => window.clearTimeout(t);
  }, [nodes, fitView]);

  useEffect(() => {
    initializeHistory(nodes);
  }, [nodes, initializeHistory]);

  const handleNodesChange = useCallback(
    createDragAwareNodesChangeHandler({
      onNodesChangeBase: onNodesChange,
      setNodes,
      commitHistory,
      persistPositions: currentNodes => saveReleaseGatePositions(currentNodes, { projectId, projectName }),
      isDraggingRef,
      didActuallyDragRef,
    }),
    [onNodesChange, setNodes, commitHistory, projectId, projectName]
  );

  return (
    <div className="flex-1 min-h-0 relative bg-[#090812] w-full h-full overflow-hidden">
      {/* Ambient fuchsia / purple background, mirrored from Live View */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute -left-[25%] top-1/2 -translate-y-1/2 w-[70%] h-[140%] bg-fuchsia-500/14 rounded-full blur-[180px]" />
        <div className="absolute -right-[25%] top-1/2 -translate-y-1/2 w-[70%] h-[140%] bg-purple-500/12 rounded-full blur-[180px]" />
        <div className="absolute inset-x-0 bottom-[-40%] h-[80%] bg-fuchsia-500/10 rounded-full blur-[170px]" />
      </div>

      {!agents.length && agentsLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <p className="text-slate-400 text-sm">
            No agents yet. Run flows in Live View to see agents here.
          </p>
        </div>
      )}

      {/* Watermark */}
      <div className="absolute bottom-10 left-10 z-0 pointer-events-none select-none opacity-20">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">
            Pluvian Release Gate Center
          </span>
          <span className="text-[8px] font-bold text-slate-700 uppercase tracking-widest font-mono">
            Validation HUD / PROJECT: {projectName || "RG_HUD"}
          </span>
        </div>
      </div>

      <RGMapToolbar
        onAutoLayout={onAutoLayout}
        onUndo={() => undo(setNodes)}
        onRedo={() => redo(setNodes)}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
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
          onSelectAgent(node.id);
        }}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={!selectedNodeId}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={!selectedNodeId}
        zoomOnScroll={!selectedNodeId}
        zoomOnDoubleClick={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="rgba(244, 114, 182, 0.55)"
        />
      </ReactFlow>
    </div>
  );
}

export function ReleaseGateMap({
  agents,
  agentsLoaded = false,
  onSelectAgent,
  projectId,
  projectName,
  selectedNodeId = null,
}: {
  agents: any[];
  agentsLoaded?: boolean;
  onSelectAgent: (agentId: string) => void;
  projectId: number;
  projectName?: string;
  selectedNodeId?: string | null;
}) {
  return (
    <ReactFlowProvider>
      <ReleaseGateMapContent
        agents={agents}
        agentsLoaded={agentsLoaded}
        onSelectAgent={onSelectAgent}
        projectId={projectId}
        projectName={projectName}
        selectedNodeId={selectedNodeId}
      />
    </ReactFlowProvider>
  );
}
