"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactFlow, {
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { AgentCardNode } from "@/components/live-view/AgentCardNode";
import DrawIOEdge from "@/components/shared/DrawIOEdge";
import { motion } from "framer-motion";
import { Plus, Minus, Maximize, LayoutGrid, Undo, Redo } from "lucide-react";
import clsx from "clsx";

const NODE_TYPES = { agentCard: AgentCardNode };
const EDGE_TYPES = { default: DrawIOEdge };

/** Zoom when a node is selected and centered. */
const FOCUS_ZOOM = 1.2;
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
    "flex flex-col bg-[#1a1a1e]/95 border border-white/[0.15] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] rounded-[20px] overflow-hidden backdrop-blur-3xl relative group transition-all duration-500 hover:border-white/30";
  const btnBase =
    "flex items-center justify-center w-[52px] h-[52px] text-zinc-400 hover:text-fuchsia-400 hover:bg-white/[0.05] transition-all duration-300 relative z-10";

  return (
    <div className="absolute left-6 top-[180px] z-50 flex flex-col gap-4">
      {/* Auto Layout Button */}
      <div className={groupBase}>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60 z-10" />
        <div className="absolute inset-0.5 rounded-[18px] bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />
        <button className={btnBase} onClick={onAutoLayout} title="Auto Layout">
          <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Zoom controls */}
      <div className={groupBase}>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60 z-10" />
        <div className="absolute inset-0.5 rounded-[18px] bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />
        <button className={btnBase} onClick={() => zoomIn({ duration: 300 })}>
          <Plus className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <button className={btnBase} onClick={() => zoomOut({ duration: 300 })}>
          <Minus className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <button className={btnBase} onClick={() => fitView({ duration: 800 })}>
          <Maximize className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Undo / Redo */}
      <div className={groupBase}>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60 z-10" />
        <div className="absolute inset-0.5 rounded-[18px] bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />
        <button
          className={clsx(btnBase, !canUndo && "opacity-20 pointer-events-none grayscale")}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <Undo className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          className={clsx(btnBase, !canRedo && "opacity-20 pointer-events-none grayscale")}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <Redo className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function ReleaseGateMapContent({
  agents,
  agentsLoaded = false,
  onSelectAgent,
  projectName,
  selectedNodeId = null,
  rgDetails = null,
}: {
  agents: any[];
  agentsLoaded?: boolean;
  onSelectAgent: (agentId: string) => void;
  projectName?: string;
  selectedNodeId?: string | null;
  rgDetails?: any;
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

  const commitHistory = (newNodes: Node[]) => {
    const idx = historyIndexRef.current;
    const snapshot = newNodes.map(n => ({ ...n, position: { ...n.position } }));
    setHistory(prev => [...prev.slice(0, idx + 1), snapshot].slice(-20));
    setHistoryIndex(prev => Math.min(prev + 1, 19));
  };

  const onAutoLayout = () => {
    setNodes(currentNodes => {
      const spacingX = 400;
      const spacingY = 420;
      const cols = Math.max(1, Math.ceil(Math.sqrt(currentNodes.length)));

      const newNodes = currentNodes.map((n, idx) => ({
        ...n,
        position: {
          x: spacingX * (idx % cols),
          y: spacingY * Math.floor(idx / cols),
        },
      }));

      setTimeout(() => {
        commitHistory(newNodes);
        setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 50);
      }, 0);

      return newNodes;
    });
  };

  const agentsKey = agents?.length ? agents.map((a: any) => a.agent_id).join(",") : "";
  useEffect(() => {
    if (!agents || agents.length === 0) {
      // Avoid clearing the map during transient "no data yet" states (loading/paused).
      // Only clear nodes when we know the agents list was successfully loaded and is truly empty.
      if (agentsLoaded) setNodes([]);
      return;
    }

    setNodes(currentNodes => {
      const updatedNodes = agents.map((agent: any, idx: number) => {
        const existingNode = currentNodes.find(n => n.id === agent.agent_id);
        const isSelected = agent.agent_id === selectedNodeId;

        return {
          id: agent.agent_id,
          type: "agentCard",
          data: {
            label: agent.display_name || agent.agent_id,
            model: agent.model,
            total: agent.total,
            worstCount: agent.worst_count,
            isOfficial: agent.is_official || false,
            isGhost: agent.is_ghost || false,
            driftStatus: agent.drift_status || "official",
            signals: agent.signals,
            theme: "releaseGate",
            rgDetails: isSelected ? rgDetails : undefined,
            blur: !!selectedNodeId && !isSelected,
          },
          position: existingNode?.position || { x: 385 * (idx % 3), y: 400 * Math.floor(idx / 3) },
          selected: isSelected,
        };
      });

      return updatedNodes;
    });
  }, [agentsKey, selectedNodeId, setNodes]);

  // Keep node.selected, rgDetails, and blur in sync when selectedNodeId changes (skip during drag to avoid node jump)
  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes(current =>
      current.map(n => ({
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          rgDetails: n.id === selectedNodeId ? rgDetails : undefined,
          blur: !!selectedNodeId && n.id !== selectedNodeId,
        },
      }))
    );
  }, [selectedNodeId, rgDetails, setNodes, dragEndCounter]);

  // Camera zoom & pan to selected node
  useEffect(() => {
    if (!selectedNodeId) return;

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
  }, [nodes.length, selectedNodeId, fitView]);

  useEffect(() => {
    if (nodes.length > 0 && history.length === 0) {
      setHistory([nodes.map(n => ({ ...n, position: { ...n.position } }))]);
      setHistoryIndex(0);
    }
  }, [nodes.length, history.length]);

  const handleNodesChange = (changes: Parameters<typeof onNodesChange>[0]) => {
    const isDragging = changes.some(c => c.type === "position" && (c as any).dragging);
    if (isDragging) {
      isDraggingRef.current = true;
      didActuallyDragRef.current = true;
    }
    onNodesChange(changes);
    const hasPositionChange = changes.some(c => c.type === "position" && !(c as any).dragging);
    if (hasPositionChange) {
      setTimeout(() => {
        setNodes((currentNodes: Node[]) => {
          commitHistory(currentNodes);
          return currentNodes;
        });
      }, 0);
    }
  };

  return (
    <div className="flex-1 min-h-0 relative bg-[#1a1a24] w-full h-full">
      {/* Background layer: grid + glow + antigravity — blurred when a node is selected */}
      <div
        className={clsx(
          "absolute inset-0 pointer-events-none transition-[filter] duration-200",
          selectedNodeId && "blur-sm"
        )}
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(255, 255, 255, 0.22) 1.5px, transparent 1.5px),
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px, 100% 4px",
          backgroundPosition: "0 0, 0 0",
        }}
      >
        {/* Central Luminous Floor Glow (Fuchsia/Purple theme) */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[80%] pointer-events-none opacity-40 blur-[160px]"
          style={{
            background:
              "radial-gradient(circle at center, rgba(217, 70, 239, 0.15) 0%, rgba(168, 85, 247, 0.08) 40%, transparent 70%)",
          }}
        />
        {/* Antigravity Background Layers */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none group">
          <div className="absolute -top-[20%] -left-[10%] w-[140%] h-[140%] opacity-60 group-focus-within:opacity-80 transition-all duration-1000">
            <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/25 via-transparent to-transparent rotate-12 blur-[160px]" />
            <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/18 via-transparent to-transparent -rotate-12 blur-[140px]" />
          </div>

          <motion.div
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute top-0 bottom-0 w-[5px] bg-gradient-to-b from-transparent via-fuchsia-500/35 to-transparent rotate-[25deg] blur-md"
          />
          <motion.div
            animate={{ x: ["300%", "-100%"] }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            className="absolute top-0 bottom-0 w-[4px] bg-gradient-to-b from-transparent via-purple-500/30 to-transparent rotate-[-15deg] blur-sm opacity-70"
          />

          {Array.from({ length: 20 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: Math.random() * 1000 }}
              animate={{
                opacity: [0, 0.3, 0],
                y: [null, Math.random() * -300],
                x: [null, (Math.random() - 0.5) * 150],
              }}
              transition={{
                duration: 8 + Math.random() * 8,
                repeat: Infinity,
                delay: Math.random() * 10,
              }}
              className="absolute w-[3px] h-[3px] bg-fuchsia-400/50 rounded-full blur-[1px]"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      {!agents.length && agentsLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <p className="text-slate-400 text-sm">
            No agents yet. Run flows in Live View to see nodes here.
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
      />
    </div>
  );
}

export function ReleaseGateMap({
  agents,
  agentsLoaded = false,
  onSelectAgent,
  projectName,
  selectedNodeId = null,
  rgDetails = null,
}: {
  agents: any[];
  agentsLoaded?: boolean;
  onSelectAgent: (agentId: string) => void;
  projectName?: string;
  selectedNodeId?: string | null;
  rgDetails?: any;
}) {
  return (
    <ReactFlowProvider>
      <ReleaseGateMapContent
        agents={agents}
        agentsLoaded={agentsLoaded}
        onSelectAgent={onSelectAgent}
        projectName={projectName}
        selectedNodeId={selectedNodeId}
        rgDetails={rgDetails}
      />
    </ReactFlowProvider>
  );
}
