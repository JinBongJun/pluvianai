'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import { liveViewAPI, testLabAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowUpRight, Copy, Link2, Zap } from 'lucide-react';
import clsx from 'clsx';

type AgentItem = {
  agent_id: string;
  display_name?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  total: number;
  worst_count: number;
  last_seen?: string;
  is_deleted?: boolean;
};

export default function LiveViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const highlightedAgentId = searchParams?.get('agent') || null;

  const { data: agentsData, error: agentsError, mutate: refreshAgents } = useSWR(
    projectId ? ['live-view-agents', projectId] : null,
    () => liveViewAPI.getAgents(projectId),
  );

  const { data: connectionsData, mutate: refreshConnections } = useSWR(
    projectId ? ['live-view-connections', projectId] : null,
    () => liveViewAPI.listConnections(projectId),
  );

  const agents: AgentItem[] = useMemo(() => agentsData?.agents || [], [agentsData]);
  const overLimit = agents.length > 30;

  // React Flow canvas state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [arrowMode, setArrowMode] = useState(false);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);

  const handleCopyAll = async () => {
    if (!agents.length) return;
    try {
      const boxes = agents.map((agent, index) => ({
        id: agent.agent_id || `agent-${index + 1}`,
        label: agent.display_name || agent.agent_id || 'Agent',
        model: agent.model,
        system_prompt: agent.system_prompt,
      }));

      const canvas = await testLabAPI.createCanvas(projectId, {
        name: 'From Live View',
        boxes,
        connections: [],
      });
      toast.showToast('Copied Live View agents to Test Lab', 'success');
      router.push(`/organizations/${orgId}/projects/${projectId}/test-lab`);
    } catch {
      toast.showToast('Failed to copy to Test Lab', 'error');
    }
  };

  const handleCopyOne = async (agentId: string) => {
    if (!agentId) return;
    const agent = agents.find((a) => a.agent_id === agentId);
    if (!agent) return;
    try {
      const canvas = await testLabAPI.createCanvas(projectId, {
        name: `From Live View: ${agent.display_name || agent.agent_id || 'Agent'}`,
        boxes: [
          {
            id: agent.agent_id || 'agent-1',
            label: agent.display_name || agent.agent_id || 'Agent',
            model: agent.model,
            system_prompt: agent.system_prompt,
          },
        ],
        connections: [],
      });
      toast.showToast(`Copied ${agentId} to Test Lab`, 'success');
      router.push(`/organizations/${orgId}/projects/${projectId}/test-lab`);
    } catch {
      toast.showToast('Failed to copy to Test Lab', 'error');
    }
  };

  const handleAddConnection = useCallback(
    async (source: string, target: string) => {
      if (!source || !target || source === target) return;
      await liveViewAPI.createConnection(projectId, { source_agent_name: source, target_agent_name: target });
      refreshConnections();
      toast.showToast('Connection added', 'success');
    },
    [projectId, refreshConnections, toast],
  );

  const handleRemoveConnection = async (id: string) => {
    await liveViewAPI.deleteConnection(projectId, id);
    refreshConnections();
    toast.showToast('Connection removed', 'success');
  };

  // Derive React Flow nodes/edges from agents + connections
  useEffect(() => {
    const nextNodes: Node[] = (agents || []).map((agent, idx) => ({
      id: agent.agent_id || `agent-${idx + 1}`,
      data: {
        label: agent.display_name || agent.agent_id || 'Agent',
        worstCount: agent.worst_count,
        agentId: agent.agent_id,
      },
      position: {
        x: 200 * (idx % 4),
        y: 120 * Math.floor(idx / 4),
      },
    }));

    const nextEdges: Edge[] = (connectionsData?.connections || []).map((conn: any, idx: number) => ({
      id: conn.id || `e-${conn.source_agent_name}-${conn.target_agent_name}-${idx}`,
      source: String(conn.source_agent_name),
      target: String(conn.target_agent_name),
    }));

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [agents, connectionsData, setNodes, setEdges]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
      const { source, target } = connection;
      if (source && target) {
        void handleAddConnection(source, target);
      }
    },
    [handleAddConnection, setEdges],
  );

  const handleNodeClick = useCallback(
    (_: any, node: Node) => {
      if (arrowMode) {
        if (!connectionSourceId) {
          setConnectionSourceId(node.id);
          toast.showToast(`Source selected: ${node.id}. Click another node to create a connection.`, 'info');
          return;
        }
        if (connectionSourceId && connectionSourceId !== node.id) {
          void handleAddConnection(connectionSourceId, node.id);
          setConnectionSourceId(null);
        }
        return;
      }

      // Default: navigate to API Calls filtered by this agent
      router.push(
        `/organizations/${orgId}/projects/${projectId}/api-calls?agent=${encodeURIComponent(
          String(node.id),
        )}`,
      );
    },
    [arrowMode, connectionSourceId, handleAddConnection, orgId, projectId, router, toast],
  );

  if (!orgId || !projectId) return null;

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: `Project ${projectId}`, href: `/organizations/${orgId}/projects/${projectId}` },
        { label: 'Live View' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        <ProjectTabs projectId={projectId} orgId={orgId} />

        {overLimit && (
          <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-yellow-100 text-sm">
            박스가 30개를 초과했습니다. 추가 트래픽은 snapshots 목록에서 확인하세요.
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Live View Agents</h2>
          <div className="flex items-center gap-2">
            <Button
              variant={arrowMode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setArrowMode((prev) => !prev);
                setConnectionSourceId(null);
              }}
            >
              <Link2 className="w-4 h-4 mr-1" /> {arrowMode ? 'Connection Mode On' : 'Connection Mode'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => refreshAgents()}>
              Refresh
            </Button>
            <Button size="sm" onClick={handleCopyAll} disabled={!agents.length}>
              <Copy className="w-4 h-4 mr-2" /> Copy All to Test Lab
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div className="h-80 border border-white/10 rounded-lg bg-black/40 mb-6 overflow-hidden">
          {agents.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-ag-muted">
              트래픽이 감지되면 이곳에 에이전트 그래프가 표시됩니다.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onNodeClick={handleNodeClick}
              fitView
            >
              <Background />
              <MiniMap />
              <Controls />
            </ReactFlow>
          )}
        </div>

        {agentsError && (
          <div className="text-sm text-red-400 mb-4">에이전트 목록을 불러오지 못했습니다.</div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.agent_id}
              className={clsx(
                'border border-white/10 rounded-lg p-4 bg-white/5 backdrop-blur',
                agent.is_deleted && 'opacity-60',
                highlightedAgentId && highlightedAgentId === agent.agent_id && 'ring-2 ring-ag-accent'
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-ag-muted">Agent</div>
                  <div className="text-base font-semibold">{agent.display_name || agent.agent_id || 'Agent'}</div>
                  {agent.agent_id && (
                    <div className="text-xs text-ag-muted mt-1">{agent.agent_id}</div>
                  )}
                </div>
                <Button size="xs" variant="ghost" onClick={() => handleCopyOne(agent.agent_id || 'unknown')}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-3 text-sm text-ag-muted">Model: {agent.model || 'unknown'}</div>
              <div className="mt-2 flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-ag-text"><Zap className="w-4 h-4" /> {agent.total} calls</span>
                <span className="flex items-center gap-1 text-red-300">
                  {agent.worst_count} worst
                </span>
              </div>
              <div className="mt-2 text-xs text-ag-muted">Last seen: {agent.last_seen ? new Date(agent.last_seen).toLocaleString() : '—'}</div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push(`/organizations/${orgId}/projects/${projectId}/api-calls?agent=${agent.agent_id}`)}
                >
                  <ArrowUpRight className="w-4 h-4 mr-1" /> View Snapshots
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleAddConnection(agent.agent_id, '')}
                  disabled
                >
                  <Link2 className="w-4 h-4 mr-1" /> Link
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Connections</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const source = prompt('Source agent id');
                const target = prompt('Target agent id');
                if (source && target) handleAddConnection(source, target);
              }}
            >
              Add Connection
            </Button>
          </div>
          <div className="space-y-2">
            {(connectionsData?.connections || []).map((conn: any) => (
              <div key={conn.id} className="flex items-center justify-between border border-white/10 rounded-md px-3 py-2">
                <div className="text-sm">{conn.source_agent_name} → {conn.target_agent_name}</div>
                <Button size="xs" variant="ghost" onClick={() => handleRemoveConnection(conn.id)}>
                  Remove
                </Button>
              </div>
            ))}
            {!connectionsData?.connections?.length && (
              <div className="text-sm text-ag-muted">연결이 없습니다. Add Connection을 사용하세요.</div>
            )}
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}
