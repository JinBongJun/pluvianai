"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
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
    "flex flex-col bg-[#1C1C1E] border border-[#3A3A3C] shadow-lg rounded-[18px] overflow-hidden relative group transition-all duration-300";
  const btnBase =
    "flex items-center justify-center w-[46px] h-[46px] text-[#8E8E93] hover:text-white hover:bg-white/[0.05] transition-all duration-200 relative z-10";

  return (
    <div className="absolute left-6 top-[180px] z-50 flex flex-col gap-3.5">
      {/* Auto Layout Button */}
      <div className={groupBase}>
        <button className={btnBase} onClick={onAutoLayout} title="Auto Layout">
          <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Zoom controls */}
      <div className={groupBase}>
        <button className={btnBase} onClick={() => zoomIn({ duration: 300 })}>
          <Plus className="w-[20px] h-[20px]" strokeWidth={1.5} />
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
        >
          <Undo className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <button
          className={clsx(btnBase, !canRedo && "opacity-20 pointer-events-none grayscale")}
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo className="w-[18px] h-[18px]" strokeWidth={1.5} />
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
      ? `# Python (backend)\nimport requests\n\nrequests.post(\n  "https://api.pluvianai.com/api/v1/projects/${projectId}/api-calls",\n  headers={\"Authorization\": \"Bearer YOUR_API_KEY\"},\n  json={\"provider\": \"openai\", \"model\": \"gpt-4\", \"request_data\": {\"input\": \"hello\"}, \"response_data\": {\"text\": \"hello\"}, \"status_code\": 200},\n)\n\n# Node (backend)\nawait fetch(\"https://api.pluvianai.com/api/v1/projects/${projectId}/api-calls\", {\n  method: \"POST\",\n  headers: {\n    Authorization: \"Bearer YOUR_API_KEY\",\n    \"Content-Type\": \"application/json\",\n  },\n  body: JSON.stringify({ provider: \"openai\", model: \"gpt-4\", request_data: { input: \"hello\" }, response_data: { text: \"hello\" }, status_code: 200 }),\n});`
      : `# Python (backend)\nimport requests\n\nrequests.post(\n  \"https://api.pluvianai.com/api/v1/projects/YOUR_PROJECT_ID/api-calls\",\n  headers={\"Authorization\": \"Bearer YOUR_API_KEY\"},\n  json={\"provider\": \"openai\", \"model\": \"gpt-4\", \"request_data\": {\"input\": \"hello\"}, \"response_data\": {\"text\": \"hello\"}, \"status_code\": 200},\n)\n\n# Node (backend)\nawait fetch(\"https://api.pluvianai.com/api/v1/projects/YOUR_PROJECT_ID/api-calls\", {\n  method: \"POST\",\n  headers: {\n    Authorization: \"Bearer YOUR_API_KEY\",\n    \"Content-Type\": \"application/json\",\n  },\n  body: JSON.stringify({ provider: \"openai\", model: \"gpt-4\", request_data: { input: \"hello\" }, response_data: { text: \"hello\" }, status_code: 200 }),\n});`;

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
              Connect your LLM calls — agents will show up here in real time.
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto font-medium">
              Take your existing backend where you call the LLM, send us a copy of each request and response, and this map will light up automatically.
            </p>
          </div>
        </div>

        <div className="w-full max-w-5xl grid gap-3 text-left md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Step 1</p>
            <p className="mt-2 text-sm font-semibold text-white">Copy project credentials</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Open Project Settings and copy your Project ID and server API key.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Step 2</p>
            <p className="mt-2 text-sm font-semibold text-white">Paste the snippet in your backend</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Use the exact place where your app calls an LLM. Keep this server-side.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#121215]/70 px-5 py-4 shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Step 3</p>
            <p className="mt-2 text-sm font-semibold text-white">Run one request</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Trigger one test call and return here. Your first agent node should appear in seconds.
            </p>
          </div>
        </div>

        <div className="w-full max-w-xl space-y-4 text-left p-1 rounded-[32px] bg-[#121215]/60 border border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden mx-auto">
          <div className="px-6 pt-6 pb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Quick start (Python or Node)
            </p>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Copy this snippet into the place where you call your LLM (backend or worker), then run one test request. Replace YOUR_PROJECT_ID and YOUR_API_KEY from Project Settings.
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
            Make one LLM call — you should see your first agent node here within a few seconds.
          </p>
        </div>

        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Troubleshooting
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-300">
            <li>401/403: verify Project ID and API key match the same project.</li>
            <li>No nodes after 1-2 minutes: verify requests hit your backend and `/api/v1/api-calls`.</li>
            <li>Still empty: open browser Network tab and confirm `live-view/agents` returns at least one agent.</li>
          </ul>
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

function LiveViewLoadingState() {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#030303]/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-white/10 bg-[#121215]/80 px-6 py-5 text-center shadow-2xl">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-400">
          Loading Live View
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Fetching agents and snapshots for this project...
        </p>
      </div>
    </div>
  );
}

function LiveViewErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#030303]/70 backdrop-blur-sm px-6">
      <div className="w-full max-w-xl rounded-2xl border border-rose-500/30 bg-[#141016]/90 p-6 text-center shadow-2xl">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">{title}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{description}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

const LV_GRID_SPACING_X = 300;
const LV_GRID_SPACING_Y = 200;
const LV_GRID_COLS = 3;

function getLvStorageKey(projectId: number) {
  return `lv-node-positions-${projectId}`;
}

function loadLvPositions(projectId: number): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(getLvStorageKey(projectId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLvPositions(nodes: Node[], projectId: number) {
  try {
    const map: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      map[n.id] = { x: n.position.x, y: n.position.y };
    });
    localStorage.setItem(getLvStorageKey(projectId), JSON.stringify(map));
  } catch {}
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

  const {
    data: agentsData,
    mutate: mutateAgents,
    isLoading: agentsLoading,
    error: agentsError,
  } = useSWR(
    projectId && !isNaN(projectId) && projectId > 0 ? ["live-view-agents", projectId] : null,
    () => liveViewAPI.getAgents(projectId)
  );

  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Undo / Redo History State for Node Positions
  const [history, setHistory] = useState<Node[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const isDraggingRef = useRef(false);
  const didActuallyDragRef = useRef(false);
  const [dragEndCounter, setDragEndCounter] = useState(0);

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
      const cols = Math.max(1, Math.ceil(Math.sqrt(currentNodes.length)));

      const newNodes = currentNodes.map((n, idx) => ({
        ...n,
        position: {
          x: LV_GRID_SPACING_X * (idx % cols),
          y: LV_GRID_SPACING_Y * Math.floor(idx / cols),
        },
      }));

      setTimeout(() => {
        commitHistory(newNodes);
        saveLvPositions(newNodes, projectId);
        setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 50);
      }, 0);

      return newNodes;
    });
  };

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"logs" | "eval" | "data" | "settings">("logs");

  // Calculate Real Telemetry Stats from backend data
  const telemetryStats = useMemo(() => {
    const telemetryAgents = Array.isArray(agentsData?.agents)
      ? agentsData.agents
      : Array.isArray((agentsData as any)?.data?.agents)
        ? (agentsData as any).data.agents
        : [];
    if (!telemetryAgents.length) return undefined;

    const agents = telemetryAgents;
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

  // Sync Data to React Flow (support both { agents } and { data: { agents } } from API)
  const agentsList = useMemo(
    () =>
      Array.isArray(agentsData?.agents)
        ? agentsData.agents
        : Array.isArray((agentsData as any)?.data?.agents)
          ? (agentsData as any).data.agents
          : [],
    [agentsData]
  );

  useEffect(() => {
    if (typeof agentsData === "undefined") return;

    const saved = loadLvPositions(projectId);

    setNodes(currentNodes => {
      const updatedNodes = agentsList.map((agent: any, idx: number) => {
        const existingNode = currentNodes.find(n => n.id === agent.agent_id);
        const isSelected = agent.agent_id === selectedAgentId;
        const savedPos = saved[agent.agent_id];
        const defaultPos = {
          x: LV_GRID_SPACING_X * (idx % LV_GRID_COLS),
          y: LV_GRID_SPACING_Y * Math.floor(idx / LV_GRID_COLS),
        };

        return {
          id: agent.agent_id,
          type: agent.node_type || "agentCard",
          selected: isSelected,
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
          position: existingNode?.position || savedPos || defaultPos,
        };
      });

      if (history.length === 0 && updatedNodes.length > 0) {
        setHistory([updatedNodes.map((n: any) => ({ ...n, position: { ...n.position } }))]);
        setHistoryIndex(0);
      }

      return updatedNodes;
    });
  }, [agentsData, agentsList, selectedAgentId, projectId]);

  // Reset node selected/blur state after drag ends or selection changes
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
  const showLoadingOverlay = agentsLoading && typeof agentsData === "undefined";
  const showAccessDeniedOverlay = !!agentsError && (agentsErrorStatus === 401 || agentsErrorStatus === 403);
  const showApiErrorOverlay = !!agentsError && !showAccessDeniedOverlay;
  const showEmptyOverlay =
    !showLoadingOverlay &&
    !showAccessDeniedOverlay &&
    !showApiErrorOverlay &&
    agentsList.length === 0;

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
          width={760}
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
      <div className="flex-1 min-h-0 relative bg-[#050B08] overflow-hidden">
        {/* Ambient emerald background, inspired by landing hero */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute -left-[25%] top-1/2 -translate-y-1/2 w-[70%] h-[140%] bg-emerald-500/14 rounded-full blur-[180px]" />
          <div className="absolute -right-[25%] top-1/2 -translate-y-1/2 w-[70%] h-[140%] bg-teal-400/10 rounded-full blur-[180px]" />
          <div className="absolute inset-x-0 bottom-[-40%] h-[80%] bg-emerald-500/12 rounded-full blur-[170px]" />
        </div>

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
            title="Unable to Load Agents"
            description="We could not reach the Live View API right now. Please retry in a few seconds. If the problem continues, check backend health and network connectivity."
            onRetry={() => void mutateAgents()}
          />
        )}
        {showEmptyOverlay && <LiveViewEmptyState project={project} projectId={projectId} />}

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
            const dragging = changes.some(c => c.type === "position" && (c as any).dragging);
            if (dragging) {
              isDraggingRef.current = true;
              didActuallyDragRef.current = true;
            }
            const filtered = changes.filter(c => {
              if (c.type === "select" && isDraggingRef.current) return false;
              return true;
            });
            onNodesChange(filtered);

            const hasPositionChange = changes.some(c => c.type === "position" && !(c as any).dragging);
            if (hasPositionChange) {
              setTimeout(() => {
                setNodes(currentNodes => {
                  commitHistory(currentNodes);
                  saveLvPositions(currentNodes, projectId);
                  return currentNodes;
                });
              }, 0);
            }
          }}
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
