'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  addEdge,
  Connection,
  Edge,
  Node,
} from 'reactflow';
import 'reactflow/dist/style.css';

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import { TestLabInputNode } from '@/components/test-lab/TestLabInputNode';
import { TestLabEvalNode } from '@/components/test-lab/TestLabEvalNode';
import { projectsAPI, organizationsAPI, liveViewAPI, testRunsAPI } from '@/lib/api';
import { TestLabBoxNode } from '@/components/test-lab/TestLabBoxNode';
import DrawIOEdge from '@/components/shared/DrawIOEdge';
import RailwaySidePanel from '@/components/shared/RailwaySidePanel';
import { TestLabInspector } from '@/components/test-lab/TestLabInspector';
import { TestLabToolbar } from '@/components/test-lab/TestLabToolbar';
import { TestLabSidebar } from '@/components/test-lab/TestLabSidebar';
import { TestLabEdge } from '@/components/test-lab/TestLabEdge';
import { Beaker, Copy, Plus, Bot } from 'lucide-react';

// Node Types Registration
const nodeTypes = {
  agentCard: TestLabBoxNode,
  inputNode: TestLabInputNode,
  evalNode: TestLabEvalNode,
};

const edgeTypes = {
  default: TestLabEdge,
};

export default function TestLabPage() {
  const params = useParams();
  const orgId = params?.orgId as string;
  const projectId = Number(params?.projectId);

  const { data: project } = useSWR(projectId ? ['project', projectId] : null, () => projectsAPI.get(projectId));
  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () => organizationsAPI.get(orgId));

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);

  // Handle Updates
  const updateNodeData = useCallback((nodeId: string, newData: any) => {
    setNodes(nds => nds.map(node => {
      if (node.id === nodeId) {
        return { ...node, data: { ...node.data, ...newData } };
      }
      return node;
    }));
  }, [setNodes]);

  // Interactive Handlers
  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({
    ...params,
    type: 'default',
    markerEnd: { type: 'arrowclosed' as any, color: '#8b5cf6' },
    data: { order: eds.length + 1 }
  }, eds)), [setEdges]);

  const onEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
    setEdges((eds) => eds.filter((e) => !edgesToDelete.find((etd) => etd.id === e.id)));
  }, [setEdges]);

  // Run Test Logic
  const handleRunTest = async () => {
    if (nodes.length === 0) {
      alert("Canvas is empty. Add nodes to run a test.");
      return;
    }
    setIsRunning(true);
    try {
      await testRunsAPI.create(projectId, { nodes, edges });
      alert('Test Run Initiated Successfully! 🚀');
    } catch (error) {
      console.error('Test run failed:', error);
      alert('Failed to initiate test run.');
    } finally {
      setIsRunning(false);
    }
  };

  // Clone from Live Logic
  const handleCloneFromLive = async () => {
    try {
      const liveData = await liveViewAPI.getAgents(projectId);

      if (!liveData?.agents || liveData.agents.length === 0) {
        alert("No active agents found in the Live Environment. Please integrate the SDK first.");
        return;
      }

      const connData = await liveViewAPI.listConnections(projectId);

      const nextNodes: Node[] = (liveData.agents || []).map((agent: any, idx: number) => ({
        id: agent.agent_id,
        type: 'agentCard',
        data: {
          label: agent.display_name || agent.agent_id,
          model: agent.model,
          systemPrompt: agent.system_prompt || '',
        },
        position: { x: 380 * (idx % 3) + 100, y: 300 * Math.floor(idx / 3) + 100 },
      }));

      const nextEdges: Edge[] = (connData?.connections || []).map((conn: any) => ({
        id: conn.id,
        source: conn.source_agent_name,
        target: conn.target_agent_name,
        type: 'default',
        markerEnd: { type: 'arrowclosed' as any, color: '#8b5cf6' },
      }));

      setNodes(nextNodes);
      setEdges(nextEdges);
    } catch (err) {
      console.error('Failed to clone from live:', err);
      alert("Failed to communicate with the Live Environment.");
    }
  };

  // Node Creation Helpers
  const createNode = (type: string, label: string, data: any = {}) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      data: { label, ...data },
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
    };
    setNodes((nds) => nds.concat(newNode));
    setSelectedNodeId(id);
  };

  const handleAddInput = () => createNode('inputNode', 'User Input', { textInput: '', inputType: 'text' });
  const handleAddAgent = () => createNode('agentCard', 'New Agent', { model: 'gpt-4o', status: 'idle' });
  const handleAddEval = () => createNode('evalNode', 'Evaluator', { status: 'pending' });

  // Render Empty Sandbox State
  const renderEmptySandbox = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#0a0a0c] z-0 pointer-events-none">
      <div className="absolute inset-0 bg-flowing-lines opacity-10" />
      <div className="text-center space-y-8 max-w-2xl px-8 relative z-10 -mt-16">
        <div className="p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 inline-block shadow-[0_0_30px_rgba(16,185,129,0.1)]">
          <Beaker className="w-10 h-10 text-emerald-500 animate-pulse" />
        </div>
        <div className="space-y-4">
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">The Lab is Sterile</h2>
          <p className="text-base font-medium text-slate-500 leading-relaxed max-w-md mx-auto">
            Your sandbox is currently empty. Initialize the graph using the toolbar above.
          </p>
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
      activeTab="test-lab"
      showTelemetry={false}
      mode="LAB"
      status="SANDBOX"
      onAction={(actionId) => {
        if (actionId === 'add-agent') handleAddAgent();
        console.log('Lab HUD Action:', actionId)
      }}
      rightPanel={
        <RailwaySidePanel
          title={selectedNode?.data?.label || selectedNodeId || 'Inspector'}
          isOpen={!!selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        >
          {selectedNode && (
            <TestLabInspector
              node={selectedNode}
              onUpdate={(data: any) => updateNodeData(selectedNode.id, data)}
            />
          )}
        </RailwaySidePanel>
      }
    >
      <div className="flex-1 min-h-0 relative bg-[#0a0a0c]">

        {/* New Utility Sidebar */}
        <TestLabSidebar />

        {/* New Floating Toolbar */}
        <TestLabToolbar
          onAddInput={handleAddInput}
          onAddAgent={handleAddAgent}
          onAddEval={handleAddEval}
          onCloneLive={handleCloneFromLive}
          onRunTest={handleRunTest}
        />

        {!nodes.length && renderEmptySandbox()}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => setSelectedNodeId(String(node.id))}
          deleteKeyCode={['Backspace', 'Delete']}
          connectionMode={ConnectionMode.Loose}
          fitView
        >
          <Background variant={BackgroundVariant.Lines} gap={60} size={1} color="rgba(255, 255, 255, 0.03)" />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255, 255, 255, 0.015)" />
        </ReactFlow>
      </div>
    </CanvasPageLayout>
  );
}

