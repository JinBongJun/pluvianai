'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import ReactFlow, {
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  addEdge,
  useEdgesState,
  useNodesState,
  MarkerType,
  ConnectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import Button from '@/components/ui/Button';
import { liveViewAPI, testLabAPI, projectsAPI, organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowUpRight, Copy, Link2, Zap } from 'lucide-react';
import clsx from 'clsx';
import { AgentCardNode } from '@/components/live-view/AgentCardNode';
import type { AgentCardNodeData } from '@/components/live-view/AgentCardNode';
import DrawIOEdge from '@/components/shared/DrawIOEdge';
import RailwaySidePanel from '@/components/shared/RailwaySidePanel';

// Define nodeTypes and edgeTypes outside component to prevent unnecessary re-renders
const nodeTypes = {
  agentCard: AgentCardNode,
};

const edgeTypes = {
  default: DrawIOEdge,
};

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

type SnapshotItem = {
  id: string;
  created_at?: string;
  request_prompt?: string;
  response_text?: string;
  is_worst?: boolean;
  status_code?: number;
};

interface LiveViewSettingsSectionProps {
  projectId: number;
  agent: AgentItem;
  onSaved: () => void;
}

function LiveViewSettingsSection({ projectId, agent, onSaved }: LiveViewSettingsSectionProps) {
  const toast = useToast();
  const [name, setName] = useState(agent.display_name || '');
  const [isDeleted, setIsDeleted] = useState<boolean>(!!agent.is_deleted);

  useEffect(() => {
    setName(agent.display_name || '');
    setIsDeleted(!!agent.is_deleted);
  }, [agent.display_name, agent.is_deleted]);

  const handleSave = useCallback(async () => {
    try {
      await liveViewAPI.updateAgentSettings(projectId, agent.agent_id, {
        display_name: name || undefined,
        is_deleted: isDeleted,
      });
      toast.showToast('Agent settings saved', 'success');
      onSaved();
    } catch {
      toast.showToast('Failed to save agent settings', 'error');
    }
  }, [agent.agent_id, isDeleted, name, onSaved, projectId, toast]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] text-ag-muted mb-1">Display name</label>
        <input
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent display name"
        />
      </div>
      <label className="inline-flex items-center gap-2 text-[11px] text-ag-muted">
        <input
          type="checkbox"
          className="h-3 w-3 rounded border-white/20 bg-black/40"
          checked={isDeleted}
          onChange={(e) => setIsDeleted(e.target.checked)}
        />
        Mark as deleted (hide from default views)
      </label>
      <div className="pt-2">
        <Button size="sm" onClick={handleSave}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

export default function LiveViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const highlightedAgentId = searchParams?.get('agent') || null;

  const { data: project } = useSWR(
    projectId ? ['project', projectId] : null,
    () => projectsAPI.get(projectId),
  );
  const { data: org } = useSWR(
    orgId ? ['organization', orgId] : null,
    () => organizationsAPI.get(orgId, { includeStats: false }),
  );

  const LIVE_VIEW_BACKEND_ENABLED = true;

  useEffect(() => {
    if (project?.usage_mode === 'test_only' && orgId && projectId) {
      router.replace(`/organizations/${orgId}/projects/${projectId}/test-lab`);
    }
  }, [project?.usage_mode, orgId, projectId, router]);

  const { data: agentsData, error: agentsError, mutate: refreshAgents } = useSWR(
    LIVE_VIEW_BACKEND_ENABLED && projectId ? ['live-view-agents', projectId] : null,
    () => liveViewAPI.getAgents(projectId),
  );

  const { data: connectionsData, mutate: refreshConnections } = useSWR(
    LIVE_VIEW_BACKEND_ENABLED && projectId ? ['live-view-connections', projectId] : null,
    () => liveViewAPI.listConnections(projectId),
  );

  const agents: AgentItem[] = useMemo(() => agentsData?.agents || [], [agentsData]);
  const overLimit = agents.length > 30;

  // React Flow canvas state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'prompt' | 'metrics' | 'snapshots' | 'worst' | 'settings'>('prompt');

  const selectedAgent: AgentItem | null = useMemo(
    () => agents.find((a) => a.agent_id === selectedAgentId) || null,
    [agents, selectedAgentId],
  );

  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].agent_id);
    }
  }, [agents, selectedAgentId]);

  const { data: snapshotsData } = useSWR(
    selectedAgentId ? ['live-view-snapshots', projectId, selectedAgentId] : null,
    () => liveViewAPI.listSnapshots(projectId, { agent_id: selectedAgentId || undefined, limit: 20 }),
  );

  const snapshots: SnapshotItem[] = useMemo(() => {
    if (!snapshotsData) return [];
    if (Array.isArray(snapshotsData)) return snapshotsData as SnapshotItem[];
    if (Array.isArray((snapshotsData as any).items)) return (snapshotsData as any).items as SnapshotItem[];
    if (Array.isArray((snapshotsData as any).data)) return (snapshotsData as any).data as SnapshotItem[];
    return [];
  }, [snapshotsData]);

  const worstSnapshots: SnapshotItem[] = useMemo(
    () => snapshots.filter((s) => s.is_worst),
    [snapshots],
  );

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

  // Derive React Flow nodes/edges from agents + connections (Design + image: card with icon, title, Online)
  useEffect(() => {
    const nextNodes: Node<AgentCardNodeData>[] = (agents || []).map((agent, idx) => ({
      id: agent.agent_id || `agent-${idx + 1}`,
      type: 'agentCard',
      data: {
        label: agent.display_name || agent.agent_id || 'Agent',
        subtitle: agent.model || agent.agent_id || undefined,
        model: agent.model || undefined,
        total: agent.total,
        worstCount: agent.worst_count,
        agentId: agent.agent_id,
      },
      position: {
        x: 220 * (idx % 4),
        y: 140 * Math.floor(idx / 4),
      },
    }));

    const nextEdges: Edge[] = (connectionsData?.connections || []).map((conn: any, idx: number) => ({
      id: conn.id || `e-${conn.source_agent_name}-${conn.target_agent_name}-${idx}`,
      source: String(conn.source_agent_name),
      target: String(conn.target_agent_name),
      type: 'default',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
      },
      style: {
        strokeWidth: 2.5,
        stroke: '#8b5cf6',
      },
    }));

    setNodes(nextNodes as Node[]);
    setEdges(nextEdges);
  }, [agents, connectionsData, setNodes, setEdges]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'default',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            },
            style: {
              strokeWidth: 2.5,
              stroke: '#8b5cf6',
            },
          },
          eds,
        ),
      );
      const { source, target } = connection;
      if (source && target) {
        void handleAddConnection(source, target);
      }
    },
    [handleAddConnection, setEdges],
  );

  const handleNodeClick = useCallback(
    (_: any, node: Node) => {
      // Always allow node selection for detail panel
      setSelectedAgentId(String(node.id));
      setDetailTab('prompt');
    },
    [],
  );

  if (!orgId || !projectId) return null;

  if (project?.usage_mode === 'test_only') {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-slate-400">
        <span>Redirecting to Test Lab...</span>
      </div>
    );
  }

  const rightPanelContent = selectedAgent ? (
    <div className="px-5 py-4 space-y-5 text-sm">
      {detailTab === 'prompt' && (
        <div>
          <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">System Prompt</div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-4 whitespace-pre-wrap min-h-[120px] text-sm text-slate-300 leading-relaxed">
            {selectedAgent.system_prompt || 'System prompt not captured.'}
          </div>
        </div>
      )}
      {detailTab === 'metrics' && (
        <div className="space-y-4">
          <div className="flex gap-6">
            <div>
              <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Total calls</div>
              <div className="font-semibold text-white text-lg">{selectedAgent.total}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Worst cases</div>
              <div className="font-semibold text-red-300 text-lg">{selectedAgent.worst_count}</div>
            </div>
          </div>
          <div className="pt-4 border-t border-white/10">
            <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Last seen</div>
            <div className="text-sm text-slate-300">
              {selectedAgent.last_seen ? new Date(selectedAgent.last_seen).toLocaleString() : '—'}
            </div>
          </div>
        </div>
      )}
      {(detailTab === 'snapshots' || detailTab === 'worst') && (
        <div className="space-y-3">
          {(() => {
            const items = detailTab === 'worst' ? worstSnapshots : snapshots;
            if (!items.length) {
              return (
                <div className="text-sm text-slate-500 py-8 text-center">
                  No snapshots yet.
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {items.slice(0, 10).map((snap) => (
                  <div
                    key={snap.id}
                    className={clsx(
                      'rounded-lg border p-3',
                      snap.is_worst ? 'border-red-500/60 bg-red-500/10' : 'border-white/10 bg-black/40',
                    )}
                  >
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-slate-500">
                        {snap.created_at ? new Date(snap.created_at).toLocaleString() : ''}
                      </span>
                      {snap.is_worst && (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/80 text-xs font-semibold text-black">
                          WORST
                        </span>
                      )}
                    </div>
                    {snap.request_prompt && (
                      <div className="text-xs text-slate-400 line-clamp-2 mb-1">
                        <span className="font-semibold text-slate-300">Input: </span>
                        {snap.request_prompt}
                      </div>
                    )}
                    {snap.response_text && (
                      <div className="text-xs text-slate-400 line-clamp-2">
                        <span className="font-semibold text-slate-300">Response: </span>
                        {snap.response_text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
      {detailTab === 'settings' && selectedAgent && (
        <LiveViewSettingsSection
          projectId={projectId}
          agent={selectedAgent}
          onSaved={() => refreshAgents()}
        />
      )}
    </div>
  ) : null;

  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      activeTab="live-view"
      onCopyAllToTestLab={handleCopyAll}
      copyAllDisabled={!agents.length}
      showCopyButton
      rightPanel={
        <RailwaySidePanel
          title={selectedAgent?.display_name || selectedAgent?.agent_id || 'No agent selected'}
          isOpen={!!selectedAgent}
          onClose={() => setSelectedAgentId(null)}
          tabs={[
            { id: 'prompt', label: 'Prompt' },
            { id: 'metrics', label: 'Metrics' },
            { id: 'snapshots', label: 'Snapshots' },
            { id: 'worst', label: 'Worst' },
            { id: 'settings', label: 'Settings' },
          ]}
          activeTab={detailTab}
          onTabChange={(tabId) => setDetailTab(tabId as typeof detailTab)}
          headerActions={
            selectedAgent ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  router.push(
                    `/organizations/${orgId}/projects/${projectId}/api-calls?agent=${encodeURIComponent(
                      selectedAgent.agent_id,
                    )}`,
                  )
                }
              >
                <ArrowUpRight className="w-3 h-3 mr-1" />
                API Calls
              </Button>
            ) : undefined
          }
        >
          {rightPanelContent}
        </RailwaySidePanel>
      }
    >
      {overLimit && (
        <div className="flex-shrink-0 mx-4 mt-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-yellow-100 text-sm">
          박스가 30개를 초과했습니다. 추가 트래픽은 Snapshots 탭에서 확인하세요.
        </div>
      )}
      {edges.length > 0 && (
        <div className="flex-shrink-0 mx-4 mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100 text-sm flex items-center justify-between">
          <span>Arrows are user-drawn. May differ from actual agent flow. Verify in Test Lab.</span>
          <button type="button" onClick={() => { }} className="text-amber-300 hover:text-white" aria-label="Dismiss">✕</button>
        </div>
      )}
      <div className="flex-1 flex items-stretch gap-2 p-3 min-h-0">
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {(agentsError || agents.length === 0) ? (
            <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#16161a] text-slate-400 text-sm">
              <div className="text-center">
                <p className="font-medium text-slate-300">No data yet</p>
                <p className="mt-1 text-xs">Connect your SDK to see agents here</p>
                <a
                  href={`/organizations/${orgId}/projects/${projectId}/settings/api-keys`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300"
                >
                  View SDK integration (API Keys)
                </a>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-[#16161a] overflow-hidden">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                className="bg-[#16161a]"
                proOptions={{ hideAttribution: true }}
                connectionMode={ConnectionMode.Loose}
                defaultEdgeOptions={{
                  type: 'default',
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                  },
                  style: {
                    strokeWidth: 2,
                    stroke: '#8b5cf6',
                  },
                }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={28}
                  size={1.6}
                  color="rgba(148, 163, 184, 0.4)"
                />
              </ReactFlow>
            </div>
          )}
        </div>
      </div>
      {(connectionsData?.connections?.length ?? 0) > 0 && (
        <div className="flex-shrink-0 mx-3 mb-3 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-slate-400">
          <span className="font-medium text-slate-300">Connections:</span>{' '}
          {(connectionsData!.connections as any[]).map((c: any) => `${c.source_agent_name} → ${c.target_agent_name}`).join(', ')}
        </div>
      )}
    </CanvasPageLayout>
  );
}

