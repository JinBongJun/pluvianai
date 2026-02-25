'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import clsx from 'clsx';
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
} from 'reactflow';
import 'reactflow/dist/style.css';

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import { behaviorAPI, liveViewAPI, projectsAPI, organizationsAPI } from '@/lib/api';
import { AgentCardNode } from '@/components/live-view/AgentCardNode';
import DrawIOEdge from '@/components/shared/DrawIOEdge';
import RailwaySidePanel from '@/components/shared/RailwaySidePanel';
import { NodeFocusHandler } from '@/components/shared/NodeFocusHandler';
import { Activity, ShieldAlert, Database, Copy, Zap, ShieldCheck, FileText, Plus, Minus, Maximize, Undo, Redo, Layers, Grip, LayoutGrid } from 'lucide-react';
import { ClinicalLog } from '@/components/live-view/ClinicalLog';
import { AgentEvaluationPanel } from '@/components/live-view/AgentEvaluationPanel';
import { ClinicalLogDataSection } from '@/components/live-view/ClinicalLogDataSection';

// Stable references for React Flow (avoid "new nodeTypes/edgeTypes object" warning)
const NODE_TYPES = { agentCard: AgentCardNode };
const EDGE_TYPES = { default: DrawIOEdge };

function LiveViewToolbar({
  onUndo,
  onRedo,
  onAutoLayout,
  canUndo,
  canRedo
}: {
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const groupBase = "flex flex-col bg-[#111115]/90 border border-white/[0.08] shadow-2xl rounded-xl overflow-hidden backdrop-blur-xl";
  const btnBase = "flex items-center justify-center w-[46px] h-[46px] text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors";

  return (
    <div className="absolute left-6 top-6 z-50 flex flex-col gap-4">
      {/* Auto Layout Button */}
      <div className={groupBase}>
        <button
          className={btnBase}
          onClick={onAutoLayout}
          title="Auto Layout"
        >
          <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Zoom controls */}
      <div className={groupBase}>
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
        <button
          className={clsx(btnBase, "disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed")}
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          className={clsx(btnBase, "disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed")}
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo className="w-4 h-4" strokeWidth={1.5} />
        </button>
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

  const { data: project } = useSWR(projectId && !isNaN(projectId) ? ['project', projectId] : null, () => projectsAPI.get(projectId));
  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () => organizationsAPI.get(orgId));

  const { data: agentsData } = useSWR(projectId && !isNaN(projectId) && projectId > 0 ? ['live-view-agents', projectId] : null, () => liveViewAPI.getAgents(projectId));

  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Undo / Redo History State for Node Positions
  const [history, setHistory] = useState<Node[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Helper to commit current nodes position to history
  const commitHistory = (newNodes: Node[]) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      // Deep clone node positions to avoid mutating history
      const snapshot = newNodes.map(n => ({ ...n, position: { ...n.position } }));
      return [...newHistory, snapshot].slice(-20); // Keep last 20 states
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 19));
  };

  const onAutoLayout = () => {
    setNodes((currentNodes) => {
      const spacingX = 400;
      const spacingY = 420;
      const cols = Math.max(1, Math.ceil(Math.sqrt(currentNodes.length)));

      const newNodes = currentNodes.map((n, idx) => ({
        ...n,
        position: {
          x: spacingX * (idx % cols),
          y: spacingY * Math.floor(idx / cols)
        }
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
  const [panelTab, setPanelTab] = useState<'logs' | 'eval' | 'data'>('logs');

  // Calculate Real Telemetry Stats from backend data
  const telemetryStats = useMemo(() => {
    if (!agentsData?.agents) return undefined;

    const agents = agentsData.agents;
    const totalAgents = agents.length;
    let totalWorstCount = 0;
    let totalSnapshots = 0;

    agents.forEach((a: any) => {
      totalWorstCount += (a.worst_count || 0);
      totalSnapshots += (a.total || 0);
    });

    const successRate = totalSnapshots > 0
      ? Math.max(0, 100 - (totalWorstCount / totalSnapshots) * 100).toFixed(1) + '%'
      : '--';

    return [
      { label: 'Active Neural Agents', value: totalAgents.toString(), icon: Activity, color: 'text-emerald-400', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' },
      { label: 'Avg System Latency', value: '--', icon: Zap, color: 'text-cyan-400', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.2)]' }, // Latency logic TBD from signal API
      { label: 'Safety Success Rate', value: successRate, icon: ShieldAlert, color: 'text-emerald-500', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' },
      { label: 'Security Snapshots', value: totalSnapshots.toLocaleString(), icon: Database, color: 'text-slate-400', glow: 'shadow-[0_0_20px_rgba(148,163,184,0.1)]' },
    ];
  }, [agentsData]);

  // Sync Data to React Flow
  useEffect(() => {
    if (!agentsData?.agents) return;

    setNodes((currentNodes) => {
      const updatedNodes = (agentsData.agents || []).map((agent: any, idx: number) => {
        const existingNode = currentNodes.find((n) => n.id === agent.agent_id);

        return {
          id: agent.agent_id,
          type: agent.node_type || 'agentCard',
          data: {
            label: agent.display_name || agent.agent_id,
            model: agent.model,
            total: agent.total,
            worstCount: agent.worst_count,
            isOfficial: agent.is_official || false,
            isGhost: agent.is_ghost || false,
            driftStatus: agent.drift_status || 'official',
            signals: agent.signals,
          },
          // Preserve existing position if node already exists, otherwise use grid
          position: existingNode?.position || agent.position || { x: 385 * (idx % 3), y: 400 * Math.floor(idx / 3) },
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
  }, [agentsData]); // Removed setNodes from dependency array to prevent loop

  // Premium Empty State Component
  const renderEmptyState = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#13141c] z-50 overflow-hidden">
      {/* Dynamic Scanning Grid Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.05)_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]" />

      {/* Scanning Line Effect */}
      <motion.div
        animate={{ translateY: ['0vh', '100vh'] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent z-10"
      />

      <div className="text-center space-y-10 max-w-2xl px-12 relative z-10">
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="p-6 rounded-full bg-emerald-600/10 border border-emerald-500/30 inline-block shadow-[0_0_50px_rgba(16,185,129,0.15)]"
        >
          <Activity className="w-16 h-16 text-emerald-400" strokeWidth={1.5} />
        </motion.div>

        <div className="space-y-4">
          <h2 className="text-4xl font-black text-white tracking-[0.1em] uppercase italic leading-tight drop-shadow-2xl">
            WAITING FOR <br /> <span className="text-emerald-500">LIVE TRAFFIC</span>
          </h2>
          <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em] leading-relaxed max-w-lg mx-auto italic opacity-80">
            Send your first snapshot with SDK or proxy, select an agent, then validate the latest trace.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="px-8 py-5 bg-white/[0.03] border border-white/5 rounded-[32px] backdrop-blur-xl shadow-2xl relative group hover:border-emerald-500/30 transition-all duration-500">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.5em] mb-4 text-center">INGESTION EXAMPLE</p>
            <div className="flex items-center gap-4">
              <code className="text-lg text-emerald-400 font-mono font-bold tracking-tight">POST /api/v1/projects/{'{id}'}/snapshots</code>
              <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-colors">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">SELECT AGENT {'->'} VALIDATE TRACE {'->'} OPEN BEHAVIOR HUB</p>
        </div>
      </div>
    </div>
  );

  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      activeTab="live-view"
      showTelemetry={false}
      onAction={(actionId) => {
        console.log('Live HUD Action:', actionId);
      }}
      customActions={[]}
      rightPanel={
        <RailwaySidePanel
          title={selectedAgentId || 'Agent Diagnostics'}
          isOpen={!!selectedAgentId}
          onClose={() => {
            setSelectedAgentId(null);
            setPanelTab('logs');
          }}
          tabs={[
            { id: 'logs', label: 'Clinical Log' },
            { id: 'eval', label: 'Evaluation' },
            { id: 'data', label: 'Data' },
          ]}
          activeTab={panelTab}
          onTabChange={(id) => setPanelTab(id as any)}
        >
          {panelTab === 'logs' && <ClinicalLog projectId={projectId} agentId={selectedAgentId || ''} />}

          {panelTab === 'eval' && <AgentEvaluationPanel projectId={projectId} agentId={selectedAgentId || ''} />}

          {panelTab === 'data' && <ClinicalLogDataSection projectId={projectId} agentId={selectedAgentId || ''} />}
        </RailwaySidePanel>
      }
    >
      <div className="flex-1 min-h-0 relative bg-[#13141c]"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.12) 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          backgroundPosition: '0 0'
        }}
      >
        {!nodes.length && !agentsData?.agents?.length && renderEmptyState()}

        {/* Clinical Monitoring Watermark */}
        <div className="absolute bottom-10 left-10 z-0 pointer-events-none select-none opacity-20">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Pluvian Clinical Monitoring Center</span>
            <span className="text-[8px] font-bold text-slate-700 uppercase tracking-widest font-mono">Real-time Pulse HUD / PROJECT: {project?.name || 'LIVE_HUD'}</span>
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
          onNodesChange={(changes) => {
            onNodesChange(changes);

            // If the change is a position drag end, commit to history
            const hasPositionChange = changes.some(c => c.type === 'position' && !c.dragging);
            if (hasPositionChange) {
              // We need the latest nodes state, which might not be synchronously ready here from onNodesChange,
              // but since React states batch, we'll queue a timeout to grab the state or use setNodes callback
              setTimeout(() => {
                setNodes((currentNodes) => {
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
          panOnDrag={true}
        >
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
