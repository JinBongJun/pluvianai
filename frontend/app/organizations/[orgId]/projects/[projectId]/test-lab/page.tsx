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
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import { TestLabInputNode } from '@/components/test-lab/TestLabInputNode';
import { TestLabEvalNode } from '@/components/test-lab/TestLabEvalNode';
import { TestLabBoxNode } from '@/components/test-lab/TestLabBoxNode';
import DrawIOEdge from '@/components/shared/DrawIOEdge';
import RailwaySidePanel from '@/components/shared/RailwaySidePanel';
import { TestLabInspector } from '@/components/test-lab/TestLabInspector';
import { TestLabToolbar } from '@/components/test-lab/TestLabToolbar';
import TestLabRouterNode from '@/components/test-lab/TestLabRouterNode';
import TestLabApprovalNode from '@/components/test-lab/TestLabApprovalNode';
import { TestLabEdge } from '@/components/test-lab/TestLabEdge';
import { TestLabSidebar } from '@/components/test-lab/TestLabSidebar';
import { TestLabComparisonOverlay } from '@/components/test-lab/TestLabComparisonOverlay';
import { NodeFocusHandler } from '@/components/shared/NodeFocusHandler';
import { projectsAPI, organizationsAPI, liveViewAPI, testRunsAPI } from '@/lib/api';
import { checkClinicalConnection } from '@/lib/clinical-validation';
import { Beaker } from 'lucide-react';
import { useUndoRedo } from '@/hooks/useUndoRedo';

// Node Types Registration
const nodeTypes = {
  inputNode: TestLabInputNode,
  agentCard: TestLabBoxNode,
  evalNode: TestLabEvalNode,
  routerNode: TestLabRouterNode,
  approvalNode: TestLabApprovalNode,
};

const edgeTypes = {
  default: TestLabEdge,
};

function TestLabContent() {
  const params = useParams();
  const orgId = params?.orgId as string;
  const projectId = Number(params?.projectId);
  const { getNode } = useReactFlow();

  const { data: project } = useSWR(projectId ? ['project', projectId] : null, () => projectsAPI.get(projectId));
  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () => organizationsAPI.get(orgId));

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showBattleMode, setShowBattleMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Undo/Redo Hook
  const { undo, redo, takeSnapshot, canUndo, canRedo } = useUndoRedo(setNodes, setEdges, setSelectedNodeId);

  // Connection Line Logic for Real-time Feedback
  const connectionLineStyle = {
    strokeWidth: 3,
    stroke: '#475569',
  };

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
  const onConnect = useCallback((params: Connection) => {
    takeSnapshot(nodes, edges, selectedNodeId);
    setEdges((eds) => addEdge({
      ...params,
      type: 'default',
      markerEnd: { type: 'arrowclosed' as any, color: '#10b981' },
      data: { order: eds.length + 1 }
    }, eds));
  }, [setEdges, nodes, edges, selectedNodeId, takeSnapshot]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    takeSnapshot(nodes, edges, selectedNodeId);
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [setNodes, setEdges, selectedNodeId, nodes, edges, takeSnapshot]);

  // Inject Handlers into Node Data
  const nodesWithHandlers = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onEdit: () => setSelectedNodeId(node.id),
        onDelete: () => handleDeleteNode(node.id),
      },
    }));
  }, [nodes, handleDeleteNode]);

  // Node Creation Helpers
  const createNode = (type: string, label: string, data: any = {}) => {
    takeSnapshot(nodes, edges, selectedNodeId);
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      data: {
        label,
        ...data
      },
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
    };
    setNodes((nds) => nds.concat(newNode));
    setSelectedNodeId(id);
  };

  const handleAddInput = () => createNode('inputNode', 'Start');
  const handleAddAgent = () => createNode('agentCard', 'New Agent');
  const handleAddEval = () => createNode('evalNode', 'Evaluate');
  const handleAddRouter = () => createNode('routerNode', 'Decision');
  const handleAddApproval = () => createNode('approvalNode', 'Human Review');

  const handleCloneFromLive = async () => {
    try {
      const liveData = await liveViewAPI.getAgents(projectId);
      if (!liveData?.agents) return;

      takeSnapshot(nodes, edges, selectedNodeId);
      const nextNodes: Node[] = liveData.agents.map((agent: any, idx: number) => ({
        id: agent.agent_id,
        type: 'agentCard',
        data: { label: agent.display_name, model: agent.model },
        position: { x: 380 * (idx % 3) + 500, y: 300 * Math.floor(idx / 3) + 100 },
      }));
      setNodes(nextNodes);
    } catch (err) {
      console.error(err);
    }
  };

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
        <TestLabSidebar
          onUndo={() => undo(nodes, edges, selectedNodeId)}
          onRedo={() => redo(nodes, edges, selectedNodeId)}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <TestLabToolbar
          onAddInput={handleAddInput}
          onAddAgent={handleAddAgent}
          onAddEval={handleAddEval}
          onAddRouter={handleAddRouter}
          onAddApproval={handleAddApproval}
          onCloneLive={handleCloneFromLive}
        />
        {!nodes.length && renderEmptySandbox()}
        <NodeFocusHandler selectedNodeId={selectedNodeId} isPanelOpen={!!selectedNodeId} />

        <ReactFlow
          nodes={nodesWithHandlers}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => setSelectedNodeId(String(node.id))}
          onNodeDragStart={() => takeSnapshot(nodes, edges, selectedNodeId)}
          deleteKeyCode={['Backspace', 'Delete']}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={connectionLineStyle}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} color="#1a1a1e" gap={20} />
        </ReactFlow>

        <TestLabComparisonOverlay
          isOpen={showBattleMode}
          onClose={() => setShowBattleMode(false)}
        />
      </div>
    </CanvasPageLayout>
  );
}

export default function TestLabPage() {
  return (
    <ReactFlowProvider>
      <TestLabContent />
    </ReactFlowProvider>
  );
}
