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

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import Button from '@/components/ui/Button';
import { liveViewAPI, testLabAPI, projectsAPI, organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowUpRight, Copy, Link2, Zap } from 'lucide-react';
import clsx from 'clsx';
import { AgentCardNode } from '@/components/live-view/AgentCardNode';
import type { AgentCardNodeData } from '@/components/live-view/AgentCardNode';

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

  useEffect(() => {
    if (project?.usage_mode === 'test_only' && orgId && projectId) {
      router.replace(`/organizations/${orgId}/projects/${projectId}/test-lab`);
    }
  }, [project?.usage_mode, orgId, projectId, router]);

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
    () => liveViewAPI.listSnapshots(projectId, { agent_id: selectedAgentId, limit: 20 }),
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

  const nodeTypes = useMemo(() => ({ agentCard: AgentCardNode }), []);

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
    }));

    setNodes(nextNodes as Node[]);
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

      // Default: select node to show in right-hand detail panel
      setSelectedAgentId(String(node.id));
      setDetailTab('prompt');
    },
    [arrowMode, connectionSourceId, handleAddConnection],
  );

  if (!orgId || !projectId) return null;

  if (project?.usage_mode === 'test_only') {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-slate-400">
        <span>Redirecting to Test Lab...</span>
      </div>
    );
  }

  const rightPanel = selectedAgent ? (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Selected Agent</div>
          <div className="font-semibold text-white truncate">
            {selectedAgent.display_name || selectedAgent.agent_id || 'Agent'}
          </div>
        </div>
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
      </div>
      <div className="flex border-b border-white/10 gap-0 text-xs">
        {(['prompt', 'metrics', 'snapshots', 'worst', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setDetailTab(tab)}
            className={clsx(
              'flex-1 py-2 px-2 border-b-2 transition-colors',
              detailTab === tab
                ? 'border-violet-500 text-violet-200'
                : 'border-transparent text-slate-500 hover:text-slate-300',
            )}
          >
            {tab === 'prompt' ? 'Prompt' : tab === 'metrics' ? 'Metrics' : tab === 'snapshots' ? 'Snapshots' : tab === 'worst' ? 'Worst' : 'Settings'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-2">
        {detailTab === 'prompt' && (
          <div>
            <div className="text-[11px] text-slate-500 mb-1">System Prompt</div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-3 whitespace-pre-wrap min-h-[120px]">
              {selectedAgent.system_prompt || 'System prompt not captured.'}
            </div>
          </div>
        )}
        {detailTab === 'metrics' && (
          <div className="space-y-1">
            <div className="flex gap-4">
              <div>
                <div className="text-[11px] text-slate-500">Total calls</div>
                <div className="font-semibold text-white">{selectedAgent.total}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Worst cases</div>
                <div className="font-semibold text-red-300">{selectedAgent.worst_count}</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-2">
              Last seen: {selectedAgent.last_seen ? new Date(selectedAgent.last_seen).toLocaleString() : '—'}
            </div>
          </div>
        )}
        {(detailTab === 'snapshots' || detailTab === 'worst') && (
          <div className="space-y-2">
            {(() => {
              const items = detailTab === 'worst' ? worstSnapshots : snapshots;
              if (!items.length) {
                return (
                  <div className="text-[11px] text-slate-500 py-4 text-center">
                    No snapshots yet.
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {items.slice(0, 10).map((snap) => (
                    <div
                      key={snap.id}
                      className={clsx(
                        'rounded-lg border p-2',
                        snap.is_worst ? 'border-red-500/60 bg-red-500/10' : 'border-white/10 bg-black/40',
                      )}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] text-slate-500">
                          {snap.created_at ? new Date(snap.created_at).toLocaleString() : ''}
                        </span>
                        {snap.is_worst && (
                          <span className="px-1.5 py-0.5 rounded-full bg-red-500/80 text-[10px] font-semibold text-black">
                            WORST
                          </span>
                        )}
                      </div>
                      {snap.request_prompt && (
                        <div className="text-[11px] text-slate-400 line-clamp-2">
                          <span className="font-semibold">Input: </span>
                          {snap.request_prompt}
                        </div>
                      )}
                      {snap.response_text && (
                        <div className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                          <span className="font-semibold">Response: </span>
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
      rightPanel={rightPanel}
    >
      {overLimit && (
        <div className="flex-shrink-0 mx-4 mt-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-yellow-100 text-sm">
          박스가 30개를 초과했습니다. 추가 트래픽은 Snapshots 탭에서 확인하세요.
        </div>
      )}
      {edges.length > 0 && (
        <div className="flex-shrink-0 mx-4 mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-100 text-sm flex items-center justify-between">
          <span>Arrows are user-drawn. May differ from actual agent flow. Verify in Test Lab.</span>
          <button type="button" onClick={() => {}} className="text-amber-300 hover:text-white" aria-label="Dismiss">✕</button>
        </div>
      )}
      <div className="flex-1 flex items-stretch gap-2 p-3 min-h-0">
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant={arrowMode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setArrowMode((prev) => !prev);
                setConnectionSourceId(null);
              }}
            >
              <Link2 className="w-3.5 h-3.5 mr-1" />
              {arrowMode ? 'Connection Mode On' : 'Connection Mode'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => refreshAgents()}>
              Refresh
            </Button>
          </div>
          {agentsError && (
            <div className="text-sm text-red-400">에이전트 목록을 불러오지 못했습니다.</div>
          )}
          {agents.length === 0 && !agentsError ? (
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
                fitView
                className="bg-[#16161a]"
              >
                <Background gap={16} size={1} color="rgba(255,255,255,0.06)" />
                <MiniMap className="!bg-[#1e1e24] !border-white/10" />
                <Controls className="!bg-[#1e1e24] !border-white/10 !text-white [&>button]:!bg-[#1e1e24] [&>button]:!fill-white [&>button]:!stroke-white" />
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

