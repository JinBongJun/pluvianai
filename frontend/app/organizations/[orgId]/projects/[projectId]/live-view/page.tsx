'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import ReactFlow, {
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import { liveViewAPI, projectsAPI, organizationsAPI } from '@/lib/api';
import { AgentCardNode } from '@/components/live-view/AgentCardNode';
import DrawIOEdge from '@/components/shared/DrawIOEdge';
import RailwaySidePanel from '@/components/shared/RailwaySidePanel';
import { NodeFocusHandler } from '@/components/shared/NodeFocusHandler';
import { Activity } from 'lucide-react';

const nodeTypes = {
  agentCard: AgentCardNode,
};

const edgeTypes = {
  default: DrawIOEdge,
};

function LiveViewContent() {
  const params = useParams();
  const orgId = params?.orgId as string;
  const projectId = Number(params?.projectId);

  const { data: project } = useSWR(projectId ? ['project', projectId] : null, () => projectsAPI.get(projectId));
  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () => organizationsAPI.get(orgId));

  const { data: agentsData } = useSWR(projectId ? ['live-view-agents', projectId] : null, () => liveViewAPI.getAgents(projectId));
  const { data: connectionsData } = useSWR(projectId ? ['live-view-connections', projectId] : null, () => liveViewAPI.listConnections(projectId));

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Sync Data to React Flow
  useEffect(() => {
    if (!agentsData?.agents) return;

    const nextNodes: Node[] = (agentsData.agents || []).map((agent: any, idx: number) => ({
      id: agent.agent_id,
      type: 'agentCard',
      data: {
        label: agent.display_name || agent.agent_id,
        model: agent.model,
        total: agent.total,
        worstCount: agent.worst_count,
        signals: {}, // To be populated by signal API
      },
      position: { x: 380 * (idx % 3), y: 300 * Math.floor(idx / 3) },
    }));

    const nextEdges: Edge[] = (connectionsData?.connections || []).map((conn: any) => ({
      id: conn.id,
      source: conn.source_agent_name,
      target: conn.target_agent_name,
      type: 'default',
    }));

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [agentsData, connectionsData, setNodes, setEdges]);

  // Empty State Component
  const renderEmptyState = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#0a0a0c] z-50">
      <div className="absolute inset-0 bg-flowing-lines opacity-10 pointer-events-none" />
      <div className="text-center space-y-6 max-w-lg px-8 relative z-10">
        <div className="p-4 rounded-3xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 inline-block">
          <Activity className="w-10 h-10 text-[#8b5cf6] animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight uppercase italic">Neural Network Offline</h2>
          <p className="text-sm font-mono text-slate-500 uppercase tracking-widest leading-relaxed">
            No active neural links detected. Integrate the AgentGuard SDK into your code to begin auto-mapping your architecture.
          </p>
        </div>
        <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl text-left inline-block">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Terminal Integration</p>
          <code className="text-sm text-[#8b5cf6] font-mono">npm install @agentguard/sdk</code>
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
      mode="PULSE"
      status="LIVE"
      onAction={(actionId) => console.log('Live HUD Action:', actionId)}
      rightPanel={
        <RailwaySidePanel
          title={selectedAgentId || 'Agent Diagnostics'}
          isOpen={!!selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
        >
          <div className="p-6 text-slate-500 text-sm">
            Agent Diagnostic Panel - Blueprint Implementation in progress.
          </div>
        </RailwaySidePanel>
      }
    >
      <div className="flex-1 min-h-0 relative bg-[#0a0a0c]">
        {!nodes.length && !agentsData?.agents?.length && renderEmptyState()}

        <NodeFocusHandler selectedNodeId={selectedAgentId} isPanelOpen={!!selectedAgentId} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => setSelectedAgentId(String(node.id))}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          draggable={true}
          panOnDrag={true}
        >
          <Background variant={BackgroundVariant.Lines} gap={60} size={1} color="rgba(255, 255, 255, 0.03)" />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255, 255, 255, 0.015)" />
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
