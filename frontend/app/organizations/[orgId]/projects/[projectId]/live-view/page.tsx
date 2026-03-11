"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { motion } from "framer-motion";
import clsx from "clsx";
import ReactFlow, {
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";

import CanvasPageLayout from "@/components/layout/CanvasPageLayout";
import { behaviorAPI, liveViewAPI, projectsAPI, organizationsAPI } from "@/lib/api";
import { AgentCardNode } from "@/components/live-view/AgentCardNode";
import DrawIOEdge from "@/components/shared/DrawIOEdge";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import { NodeFocusHandler } from "@/components/shared/NodeFocusHandler";
import {
  Activity,
  ShieldAlert,
  Database,
  Copy,
  Zap,
  ShieldCheck,
  FileText,
  Plus,
  Minus,
  Maximize,
  Undo,
  Redo,
  Layers,
  Grip,
  LayoutGrid,
} from "lucide-react";
import { ClinicalLog } from "@/components/live-view/ClinicalLog";
import { AgentEvaluationPanel } from "@/components/live-view/AgentEvaluationPanel";
import { ClinicalLogDataSection } from "@/components/live-view/ClinicalLogDataSection";
import { AgentSettingsPanel } from "@/components/live-view/AgentSettingsPanel";

// Stable references for React Flow (avoid "new nodeTypes/edgeTypes object" warning)
const NODE_TYPES = { agentCard: AgentCardNode };
const EDGE_TYPES = { default: DrawIOEdge };

function LiveViewToolbar({
  onUndo,
  onRedo,
  onAutoLayout,
  canUndo,
  canRedo,
}: {
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const groupBase =
    "flex flex-col bg-[#1a1a1e]/95 border border-white/[0.15] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] rounded-[20px] overflow-hidden backdrop-blur-3xl relative group transition-all duration-500 hover:border-white/30";
  const btnBase =
    "flex items-center justify-center w-[52px] h-[52px] text-zinc-400 hover:text-emerald-400 hover:bg-white/[0.05] transition-all duration-300 relative z-10";

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
        >
          <Undo className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          className={clsx(btnBase, !canRedo && "opacity-20 pointer-events-none grayscale")}
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// Premium Empty State: integration copy + quick start + link to Docs
function LiveViewEmptyState({
  project,
  projectId,
}: {
  project?: { name: string };
  projectId?: number;
}) {
  const [copied, setCopied] = useState(false);
  const snippet =
    projectId && !Number.isNaN(projectId)
      ? `# Python\npip install pluvianai\npluvianai.init(api_key="YOUR_API_KEY", project_id=${projectId})\n\n# Node\nnpm install pluvianai\npluvianai.init({ apiKey: "YOUR_API_KEY", projectId: ${projectId} })`
      : `# Python\npip install pluvianai\npluvianai.init(api_key="YOUR_API_KEY", project_id=YOUR_PROJECT_ID)\n\n# Node\nnpm install pluvianai\npluvianai.init({ apiKey: "YOUR_API_KEY", projectId: YOUR_PROJECT_ID })`;

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [snippet]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-start pt-10 pb-20 px-8 text-center bg-[#030303] z-50 overflow-y-auto custom-scrollbar">
      {/* Premium Antigravity Background Layers (Ported from OrgLayout/Landing) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Deep space radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-70" />

        {/* 1. Global Diagonal Curtain Lights */}
        <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[500px] bg-gradient-to-r from-transparent via-cyan-500/15 to-transparent -rotate-[35deg] blur-[100px] mix-blend-screen" />
        <div className="absolute top-[20%] left-[-20%] w-[150%] h-[600px] bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent -rotate-[35deg] blur-[120px] mix-blend-screen" />

        {/* 2. Geometric Light Beams */}
        <div
          className="absolute top-1/2 -left-[15%] w-[35%] h-[100%] -translate-y-1/2 rounded-[100%] opacity-40
            border-r-[2px] border-cyan-400/30 
            bg-gradient-to-l from-cyan-500/15 via-transparent to-transparent 
            shadow-[inset_-20px_0_100px_rgba(34,211,238,0.2)] mix-blend-screen"
        />
        <div
          className="absolute top-1/2 -right-[15%] w-[35%] h-[100%] -translate-y-1/2 rounded-[100%] opacity-30
            border-l-[2px] border-emerald-400/30 
            bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent 
            shadow-[inset_20px_0_100px_rgba(16,185,129,0.2)] mix-blend-screen"
        />

        {/* 3. Floating Particles */}
        <div className="absolute top-[10%] left-[30%] w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
        <div className="absolute top-[40%] right-[15%] w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-bounce duration-[3000ms]" />
        <div className="absolute bottom-[10%] right-[30%] w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
        <div className="absolute top-[15%] right-[40%] w-1 h-1 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />

        {/* Dusty Layers (SVG Dust) */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjE1KSIvPjxjaXJjbGUgY3g9IjE4MCIgY3k9IjEyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PGNpcmNsZSBjeD0iMzIwIiBjeT0iODAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjMyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjI1KSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iMjgwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMTUpIi8+PGNpcmNsZSBjeD0iMzcwIiBjeT0iMjIwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] bg-[size:300px_300px] opacity-30" />
      </div>

      <div className="text-center space-y-4 max-w-2xl px-6 relative z-10">
        <div className="flex flex-col items-center gap-6 p-10 rounded-[40px] bg-[#121215]/60 border border-white/10 backdrop-blur-3xl shadow-2xl">
          <motion.div
            animate={{
              scale: [1, 1.03, 1],
              boxShadow: [
                "0 0 40px rgba(0,0,0,0.3)",
                "0 0 60px rgba(0,0,0,0.4)",
                "0 0 40px rgba(0,0,0,0.3)",
              ],
            }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="p-6 rounded-[28px] bg-black/60 border border-white/10 backdrop-blur-2xl shadow-2xl inline-block"
          >
            <Activity
              className="w-12 h-12 text-emerald-400 mx-auto filter drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              strokeWidth={1}
            />
          </motion.div>

          <div className="space-y-3">
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] animate-pulse">
              Waiting for Live Traffic
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] leading-tight">
              Add our integration in your app — traffic will show up here.
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto font-medium">
              Python, Node, n8n, MCP, LangChain. Pick your tool below.
            </p>
          </div>
        </div>

        <div className="w-full max-w-xl space-y-4 text-left p-1 rounded-[32px] bg-[#121215]/60 border border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden mx-auto">
          <div className="px-6 pt-6 pb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Quick start (Python or Node)
            </p>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Copy the snippet, paste it where you call the LLM, then run once. Replace YOUR_API_KEY
              in Project Settings.
            </p>
          </div>
          <div className="relative mx-4 mb-4 rounded-[20px] bg-black/60 border border-white/5 p-5 font-mono text-xs text-emerald-300/90 whitespace-pre-wrap">
            <button
              type="button"
              onClick={onCopy}
              className="absolute top-3 right-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-emerald-400 border border-white/10 transition-all active:scale-95"
              title="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
            {copied && (
              <span className="absolute top-3 right-12 text-[10px] font-bold text-emerald-400 uppercase">
                Copied
              </span>
            )}
            {snippet}
          </div>
          <p className="text-[11px] text-slate-500 px-6 pb-6 font-bold uppercase tracking-widest opacity-50">
            Then make one LLM call — you should see it here.
          </p>
        </div>

        <div className="pt-2 space-y-3 p-6 rounded-[32px] bg-[#121215]/60 border border-white/10 backdrop-blur-3xl shadow-2xl max-w-xl mx-auto">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Using n8n, MCP, or LangChain?
          </p>
          <Link
            href="/docs?section=integrations"
            className="inline-flex items-center gap-2 rounded-[20px] bg-white/5 hover:bg-white/10 border border-emerald-500/30 px-6 py-3 text-sm font-bold text-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.1)] active:scale-95"
          >
            Open step-by-step guide (Docs)
          </Link>
        </div>
      </div>
    </div>
  );
}

function LiveViewContent() {
  const params = useParams();
  const nodeTypes = useMemo(() => NODE_TYPES, []);
  const edgeTypes = useMemo(() => EDGE_TYPES, []);
  const orgId = params?.orgId as string;
  // Ensure projectId is a valid number and explicitly handle array case from useParams
  const rawProjectId = params?.projectId;
  const projectIdStr = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const projectId = projectIdStr ? Number(projectIdStr) : 0;

  const { data: project } = useSWR(
    projectId && !isNaN(projectId) ? ["project", projectId] : null,
    () => projectsAPI.get(projectId)
  );
  const { data: org } = useSWR(orgId ? ["organization", orgId] : null, () =>
    organizationsAPI.get(orgId)
  );

  const { data: agentsData, mutate: mutateAgents } = useSWR(
    projectId && !isNaN(projectId) && projectId > 0 ? ["live-view-agents", projectId] : null,
    () => liveViewAPI.getAgents(projectId)
  );

  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Undo / Redo History State for Node Positions
  const [history, setHistory] = useState<Node[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Helper to commit current nodes position to history
  const commitHistory = (newNodes: Node[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      // Deep clone node positions to avoid mutating history
      const snapshot = newNodes.map(n => ({ ...n, position: { ...n.position } }));
      return [...newHistory, snapshot].slice(-20); // Keep last 20 states
    });
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

      // Commit history via timeout since state batching
      setTimeout(() => {
        commitHistory(newNodes);
        // Automatically fit view to the new layout
        setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 50);
      }, 0);

      return newNodes;
    });
  };

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"logs" | "eval" | "data" | "settings">("logs");

  // Calculate Real Telemetry Stats from backend data
  const telemetryStats = useMemo(() => {
    if (!agentsData?.agents) return undefined;

    const agents = agentsData.agents;
    const totalAgents = agents.length;
    let totalWorstCount = 0;
    let totalSnapshots = 0;

    agents.forEach((a: any) => {
      totalWorstCount += a.worst_count || 0;
      totalSnapshots += a.total || 0;
    });

    const successRate =
      totalSnapshots > 0
        ? Math.max(0, 100 - (totalWorstCount / totalSnapshots) * 100).toFixed(1) + "%"
        : "--";

    return [
      {
        label: "Active Neural Agents",
        value: totalAgents.toString(),
        icon: Activity,
        color: "text-emerald-400",
        glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]",
      },
      {
        label: "Avg System Latency",
        value: "--",
        icon: Zap,
        color: "text-cyan-400",
        glow: "shadow-[0_0_20px_rgba(34,211,238,0.2)]",
      }, // Latency logic TBD from signal API
      {
        label: "Safety Success Rate",
        value: successRate,
        icon: ShieldAlert,
        color: "text-emerald-500",
        glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]",
      },
      {
        label: "Security Snapshots",
        value: totalSnapshots.toLocaleString(),
        icon: Database,
        color: "text-slate-400",
        glow: "shadow-[0_0_20px_rgba(148,163,184,0.1)]",
      },
    ];
  }, [agentsData]);

  // Sync Data to React Flow
  useEffect(() => {
    if (!agentsData?.agents) return;

    setNodes(currentNodes => {
      const updatedNodes = (agentsData.agents || []).map((agent: any, idx: number) => {
        const existingNode = currentNodes.find(n => n.id === agent.agent_id);
        const isSelected = agent.agent_id === selectedAgentId;
        return {
          id: agent.agent_id,
          type: agent.node_type || "agentCard",
          data: {
            label: agent.display_name || agent.agent_id,
            model: agent.model,
            total: agent.total,
            worstCount: agent.worst_count,
            isOfficial: agent.is_official || false,
            isGhost: agent.is_ghost || false,
            driftStatus: agent.drift_status || "official",
            signals: agent.signals,
            blur: !!selectedAgentId && !isSelected,
          },
          // Preserve existing position if node already exists, otherwise use grid
          position: existingNode?.position ||
            agent.position || { x: 385 * (idx % 3), y: 400 * Math.floor(idx / 3) },
        };
      });

      // Initialize history on first load if empty
      if (history.length === 0 && updatedNodes.length > 0) {
        setHistory([updatedNodes.map((n: any) => ({ ...n, position: { ...n.position } }))]);
        setHistoryIndex(0);
      }

      return updatedNodes;
    });

    // setEdges([]) - Keep as is for now or handle edges similarly
  }, [agentsData, selectedAgentId]);

  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      activeTab="live-view"
      showTelemetry={false}
      navigationVariant="side"
      onAction={actionId => {
        console.log("Live HUD Action:", actionId);
      }}
      customActions={[]}
      rightPanel={
        <RailwaySidePanel
          title={selectedAgentId || "Agent Diagnostics"}
          isOpen={!!selectedAgentId}
          onClose={() => {
            setSelectedAgentId(null);
            setPanelTab("logs");
          }}
          tabs={[
            { id: "logs", label: "Clinical Log" },
            { id: "eval", label: "Evaluation" },
            { id: "data", label: "Data" },
            { id: "settings", label: "Settings" },
          ]}
          activeTab={panelTab}
          onTabChange={id => setPanelTab(id as "logs" | "eval" | "data" | "settings")}
        >
          <div
            className={panelTab === "logs" ? "h-full" : "hidden"}
            aria-hidden={panelTab !== "logs"}
          >
            <ClinicalLog projectId={projectId} agentId={selectedAgentId || ""} />
          </div>
          <div
            className={panelTab === "eval" ? "h-full" : "hidden"}
            aria-hidden={panelTab !== "eval"}
          >
            <AgentEvaluationPanel projectId={projectId} agentId={selectedAgentId || ""} />
          </div>
          <div
            className={panelTab === "data" ? "h-full" : "hidden"}
            aria-hidden={panelTab !== "data"}
          >
            <ClinicalLogDataSection projectId={projectId} agentId={selectedAgentId || ""} />
          </div>
          <div
            className={panelTab === "settings" ? "h-full" : "hidden"}
            aria-hidden={panelTab !== "settings"}
          >
            <AgentSettingsPanel
              projectId={projectId}
              agentId={selectedAgentId || ""}
              onAgentUpdated={() => void mutateAgents()}
              onAgentDeleted={() => {
                setSelectedAgentId(null);
                setPanelTab("logs");
              }}
            />
          </div>
        </RailwaySidePanel>
      }
    >
      <div className="flex-1 min-h-0 relative bg-[#1a1a24]">
        {/* Background layer: grid + glow + antigravity — blurred when a node is selected */}
        <div
          className={clsx(
            "absolute inset-0 pointer-events-none transition-[filter] duration-200",
            selectedAgentId && "blur-sm"
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
          {/* Central Luminous Floor Glow */}
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[80%] pointer-events-none opacity-40 blur-[160px]"
            style={{
              background:
                "radial-gradient(circle at center, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.08) 40%, transparent 70%)",
            }}
          />
          {/* Antigravity Background Layers (Always Persistent) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none group">
            {/* Diagonal Curtain Lights */}
            <div className="absolute -top-[20%] -left-[10%] w-[140%] h-[140%] opacity-60 group-focus-within:opacity-80 transition-all duration-1000">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/25 via-transparent to-transparent rotate-12 blur-[160px]" />
              <div className="absolute inset-0 bg-gradient-to-tl from-cyan-500/18 via-transparent to-transparent -rotate-12 blur-[140px]" />
            </div>

            {/* Persistent Geometric Beams */}
            <motion.div
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute top-0 bottom-0 w-[5px] bg-gradient-to-b from-transparent via-emerald-500/35 to-transparent rotate-[25deg] blur-md"
            />
            <motion.div
              animate={{ x: ["300%", "-100%"] }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute top-0 bottom-0 w-[4px] bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent rotate-[-15deg] blur-sm opacity-70"
            />

            {/* Subtle Ambient Particles */}
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
                className="absolute w-[3px] h-[3px] bg-emerald-400/50 rounded-full blur-[1px]"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
              />
            ))}
          </div>
        </div>

        {!nodes.length && <LiveViewEmptyState project={project} projectId={projectId} />}

        {/* Clinical Monitoring Watermark */}
        <div className="absolute bottom-10 left-10 z-0 pointer-events-none select-none opacity-20">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">
              Pluvian Clinical Monitoring Center
            </span>
            <span className="text-[8px] font-bold text-slate-700 uppercase tracking-widest font-mono">
              Real-time Pulse HUD / PROJECT: {project?.name || "LIVE_HUD"}
            </span>
          </div>
        </div>

        {/* Floating Custom Controls */}
        <LiveViewToolbar
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
          onAutoLayout={onAutoLayout}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
        />

        <NodeFocusHandler selectedNodeId={selectedAgentId} isPanelOpen={!!selectedAgentId} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={changes => {
            onNodesChange(changes);

            // If the change is a position drag end, commit to history
            const hasPositionChange = changes.some(c => c.type === "position" && !c.dragging);
            if (hasPositionChange) {
              // We need the latest nodes state, which might not be synchronously ready here from onNodesChange,
              // but since React states batch, we'll queue a timeout to grab the state or use setNodes callback
              setTimeout(() => {
                setNodes(currentNodes => {
                  commitHistory(currentNodes);
                  return currentNodes;
                });
              }, 0);
            }
          }}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => setSelectedAgentId(String(node.id))}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={!selectedAgentId}
        ></ReactFlow>
      </div>
    </CanvasPageLayout>
  );
}

export default function LiveViewPage() {
  return (
    <ReactFlowProvider>
      <LiveViewContent />
    </ReactFlowProvider>
  );
}
