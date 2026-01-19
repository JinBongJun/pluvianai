'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ChainFlowDiagram from '@/components/ChainFlowDiagram';
import { agentChainAPI, apiCallsAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, ArrowRight, Clock, CheckCircle, XCircle, Activity, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface AgentStats {
  agent_name: string;
  call_count: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  failure_count: number;
  failure_rate: number;
  avg_quality_score?: number; // Optional - may not be available for all agents
}

interface ChainProfile {
  chain_id: string;
  total_steps: number;
  unique_agents: number;
  total_latency: number;
  avg_latency_per_step: number;
  success: boolean;
  success_rate: number;
  failure_count: number;
  bottleneck_agent: string | null;
  bottleneck_latency_ms: number;
  agents: AgentStats[];
  first_call_at: string;
  last_call_at: string;
}

export default function ChainDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);
  const chainId = params.chainId as string;

  const [chain, setChain] = useState<ChainProfile | null>(null);
  const [relatedCalls, setRelatedCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadChain();
  }, [chainId, projectId, router]);

  const loadChain = async () => {
    setLoading(true);
    try {
      // Load chain profile for specific chain_id
      const profileData = await agentChainAPI.profile(projectId, chainId, 30);
      
      // Handle response structure: {chains: [...], ...} or direct chain object
      if (profileData && typeof profileData === 'object') {
        if (Array.isArray(profileData.chains) && profileData.chains.length > 0) {
          const chainData = profileData.chains[0];
          // Ensure all required fields have defaults
          setChain({
            ...chainData,
            success: chainData.success ?? false,
            bottleneck_agent: chainData.bottleneck_agent ?? null,
            agents: Array.isArray(chainData.agents) 
              ? chainData.agents.map((agent: any) => ({
                  ...agent,
                  avg_quality_score: agent.avg_quality_score ?? 0,
                }))
              : [],
          });
        } else if (profileData.chain_id) {
          // Direct chain object (not wrapped in chains array)
          setChain({
            ...profileData,
            success: profileData.success ?? false,
            bottleneck_agent: profileData.bottleneck_agent ?? null,
            agents: Array.isArray(profileData.agents)
              ? profileData.agents.map((agent: any) => ({
                  ...agent,
                  avg_quality_score: agent.avg_quality_score ?? 0,
                }))
              : [],
          });
        } else {
          throw new Error('No chain data found');
        }

        // Load related API calls for this chain
        try {
          const calls = await apiCallsAPI.list(projectId, {
            limit: 100,
          });
          // Filter by chain_id (client-side filter)
          const filteredCalls = calls.filter((call: any) => call.chain_id === chainId);
          setRelatedCalls(filteredCalls);
        } catch (error) {
          console.error('Failed to load related calls:', error);
        }
      } else {
        toast.showToast('Chain not found', 'error');
        router.push(`/dashboard/${projectId}/chains`);
      }
    } catch (error: any) {
      console.error('Failed to load chain:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load chain', 'error');
      if (error.response?.status === 403) {
        toast.showToast('Agent Chain Profiling requires Pro plan or higher. Please upgrade your subscription.', 'error');
      } else if (error.response?.status === 404) {
        router.push(`/dashboard/${projectId}/chains`);
      } else if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!chain) {
    return (
      <DashboardLayout>
        <div className="bg-[#000314] min-h-screen">
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Chain Not Found</h3>
            <p className="text-slate-400 mb-4">The chain you're looking for doesn't exist or you don't have access to it.</p>
            <Button onClick={() => router.push(`/dashboard/${projectId}/chains`)}>
              Back to Chains
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              onClick={() => router.push(`/dashboard/${projectId}/chains`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Chains
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-white">Chain Profile</h1>
              <p className="text-slate-400 mt-2">
                {chain.chain_id.substring(0, 16)}...
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {chain.success ? (
              <Badge variant="success">
                <CheckCircle className="h-3 w-3 mr-1" />
                Success
              </Badge>
            ) : (
              <Badge variant="error">
                <XCircle className="h-3 w-3 mr-1" />
                Failed ({chain.failure_count} failures)
              </Badge>
            )}
            <span className="text-sm text-slate-400">
              {new Date(chain.first_call_at).toLocaleString()} - {new Date(chain.last_call_at).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Total Steps</p>
                <p className="text-2xl font-bold text-white">{chain.total_steps}</p>
              </div>
              <Activity className="h-8 w-8 text-purple-400" />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Unique Agents</p>
                <p className="text-2xl font-bold text-white">{chain.unique_agents}</p>
              </div>
              <Activity className="h-8 w-8 text-cyan-400" />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Total Latency</p>
                <p className="text-2xl font-bold text-white">
                  {toFixedSafe(chain.total_latency / 1000, 2)}s
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-400" />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Success Rate</p>
                <p className={clsx(
                  'text-2xl font-bold',
                  chain.success_rate >= 90 ? 'text-green-400' :
                  chain.success_rate >= 70 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {toFixedSafe(chain.success_rate, 1)}%
                </p>
              </div>
              {chain.success ? (
                <CheckCircle className="h-8 w-8 text-green-400" />
              ) : (
                <XCircle className="h-8 w-8 text-red-400" />
              )}
            </div>
          </div>
        </div>

        {/* Bottleneck Warning */}
        {chain.bottleneck_agent && (
          <div className="mb-6 relative rounded-2xl border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-400" />
              <div>
                <h3 className="text-lg font-semibold text-yellow-400 mb-1">Bottleneck Detected</h3>
                <p className="text-sm text-yellow-300">
                  Agent <strong>{chain.bottleneck_agent}</strong> is the slowest component with an average latency of{' '}
                  <strong>{toFixedSafe(chain.bottleneck_latency_ms / 1000, 2)}s</strong>.
                  Consider optimizing this agent for better overall chain performance.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Chain Flow Diagram */}
        {chain.agents && chain.agents.length > 0 && (
          <div className="mb-6 relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">Agent Flow</h2>
            <ChainFlowDiagram
              agents={chain.agents}
              totalLatency={chain.total_latency}
              successRate={chain.success_rate}
            />
          </div>
        )}

        {/* Agent Performance Chart */}
        {chain.agents && chain.agents.length > 0 && (
          <div className="mb-6 relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">Agent Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chain.agents}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis
                  dataKey="agent_name"
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B0C15',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                />
                <Legend wrapperStyle={{ color: '#9ca3af' }} />
                <Bar dataKey="avg_latency_ms" fill="#a855f7" name="Avg Latency (ms)" radius={[8, 8, 0, 0]} />
                <Bar dataKey="avg_quality_score" fill="#10b981" name="Avg Quality Score" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Agent Statistics Table */}
        {chain.agents && chain.agents.length > 0 && (
          <div className="mb-6 relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Agent Statistics</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Agent</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Calls</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Avg Latency</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Total Latency</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Failures</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Failure Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Quality Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {chain.agents.map((agent: AgentStats) => (
                      <tr key={agent.agent_name} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-purple-400" />
                            <span className="text-sm font-medium text-white">{agent.agent_name}</span>
                            {agent.agent_name === chain.bottleneck_agent && (
                              <Badge variant="warning" className="text-xs">Bottleneck</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {agent.call_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {toFixedSafe(agent.avg_latency_ms / 1000, 2)}s
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {toFixedSafe(agent.total_latency_ms / 1000, 2)}s
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {agent.failure_count > 0 ? (
                            <Badge variant="error">{agent.failure_count}</Badge>
                          ) : (
                            <Badge variant="success">0</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {toFixedSafe(agent.failure_rate, 1)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge variant={agent.avg_quality_score >= 80 ? 'success' : agent.avg_quality_score >= 60 ? 'warning' : 'error'}>
                            {toFixedSafe(agent.avg_quality_score, 1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Related API Calls */}
        {relatedCalls.length > 0 && (
          <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Related API Calls</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/dashboard/${projectId}/api-calls?chain_id=${chainId}`)}
                >
                  View All
                </Button>
              </div>
              <div className="space-y-2">
                {relatedCalls.slice(0, 10).map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors"
                    onClick={() => router.push(`/dashboard/${projectId}/api-calls/${call.id}`)}
                  >
                    <div>
                      <div className="text-sm font-medium text-white">
                        {call.provider}/{call.model}
                      </div>
                      {call.agent_name && (
                        <div className="text-xs text-slate-400 mt-1">
                          Agent: {call.agent_name}
                        </div>
                      )}
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(call.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {call.latency_ms && (
                        <div className="text-sm text-slate-400">
                          {toFixedSafe(call.latency_ms / 1000, 2)}s
                        </div>
                      )}
                      {call.status_code ? (
                        call.status_code >= 200 && call.status_code < 300 ? (
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-400" />
                        )
                      ) : null}
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
