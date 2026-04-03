"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactFlow, {
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  type Node,
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

function getStorageKey(projectName?: string) {
  return `rg-node-positions-${projectName || "default"}`;
}

function loadSavedPositions(projectName?: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(getStorageKey(projectName));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePositions(nodes: Node[], projectName?: string) {
  try {
    const map: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      map[n.id] = { x: n.position.x, y: n.position.y };
    });
    localStorage.setItem(getStorageKey(projectName), JSON.stringify(map));
  } catch {}
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
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [history, setHistory] = useState<Node[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(historyIndex);
  const isDraggingRef = useRef(false);
  const didActuallyDragRef = useRef(false);
  const [dragEndCounter, setDragEndCounter] = useState(0);
  historyIndexRef.current = historyIndex;
  const prevAgentsKeyRef = useRef("");
  const pendingFitAfterNodesRef = useRef(false);
  const pendingRefreshFallbackTimeoutRef = useRef<number | null>(null);
  const suppressSelectedCenterRef = useRef(false);

  const commitHistory = (newNodes: Node[]) => {
    const idx = historyIndexRef.current;
    const snapshot = newNodes.map(n => ({ ...n, position: { ...n.position } }));
    setHistory(prev => [...prev.slice(0, idx + 1), snapshot].slice(-20));
    setHistoryIndex(prev => Math.min(prev + 1, 19));
  };

  const onAutoLayout = () => {
    setNodes(currentNodes => {
      const cols = Math.max(1, Math.ceil(Math.sqrt(currentNodes.length)));

      const newNodes = currentNodes.map((n, idx) => ({
        ...n,
        position: {
          x: RG_GRID_SPACING_X * (idx % cols),
          y: RG_GRID_SPACING_Y * Math.floor(idx / cols),
        },
      }));

      setTimeout(() => {
        commitHistory(newNodes);
        savePositions(newNodes, projectName);
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
        setHistory([]);
        setHistoryIndex(-1);
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
      setHistory([]);
      setHistoryIndex(-1);
    }
    prevAgentsKeyRef.current = agentsKey;
    if (addedAgentIds.length > 0) {
      pendingFitAfterNodesRef.current = true;
    }

    const saved = loadSavedPositions(projectName);

    setNodes(currentNodes => {
      return mapAgentsToReleaseGateNodes({
        agents,
        selectedNodeId,
        currentNodes,
        saved,
      });
    });
  }, [agentsKey, agents, agentsLoaded, selectedNodeId, setNodes, projectName]);

  // Keep node.selected and blur in sync when selectedNodeId changes (skip during drag to avoid node jump)
  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes(current =>
      current.map(n => ({
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          blur: !!selectedNodeId && n.id !== selectedNodeId,
        },
      }))
    );
  }, [selectedNodeId, setNodes, dragEndCounter, isDraggingRef]);

  // Camera zoom & pan to selected node
  useEffect(() => {
    if (!selectedNodeId) return;
    if (suppressSelectedCenterRef.current) return;

    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    // We want to center the camera on the *actual* rendered node.
    // The previous hardcoded addition of 900/640 caused the camera to shoot way off to the bottom right
    // because ReactFlow's node.position is the top-left corner.
    // Let's use the actual current width/height of the node as reported by ReactFlow,
    // or fallback to the base dimensions if it hasn't expanded yet.
    const currentWidth = node.width ?? 340;
    const currentHeight = node.height ?? 200;

    const cx = node.position.x + currentWidth / 2;
    const cy = node.position.y + currentHeight / 2 + FOCUS_Y_OFFSET_UP;

    setCenter(cx, cy, { zoom: FOCUS_ZOOM, duration: FOCUS_DURATION_MS });
  }, [selectedNodeId, nodes, setCenter]); // 'nodes' dependency added here

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
    if (nodes.length > 0 && history.length === 0) {
      setHistory([nodes.map(n => ({ ...n, position: { ...n.position } }))]);
      setHistoryIndex(0);
    }
  }, [nodes, history.length]);

  const handleNodesChange = (changes: Parameters<typeof onNodesChange>[0]) => {
    const isDragging = changes.some(c => c.type === "position" && (c as any).dragging);
    if (isDragging) {
      isDraggingRef.current = true;
      didActuallyDragRef.current = true;
    }
    // Filter out ReactFlow's auto-select on drag to prevent color changes
    const filtered = changes.filter(c => {
      if (c.type === "select" && isDraggingRef.current) return false;
      return true;
    });
    onNodesChange(filtered);
    const hasPositionChange = changes.some(c => c.type === "position" && !(c as any).dragging);
    if (hasPositionChange) {
      setTimeout(() => {
        setNodes((currentNodes: Node[]) => {
          commitHistory(currentNodes);
          savePositions(currentNodes, projectName);
          return currentNodes;
        });
      }, 0);
    }
  };

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
        onUndo={() => {
          if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setNodes(history[newIndex]);
          }
        }}
        onRedo={() => {
          if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setNodes(history[newIndex]);
          }
        }}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
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
            setDragEndCounter(c => c + 1);
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
