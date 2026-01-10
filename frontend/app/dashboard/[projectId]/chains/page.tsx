'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Select from '@/components/ui/Select';
import { agentChainAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Activity, Clock, CheckCircle, XCircle, GitBranch } from 'lucide-react';
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
import ChainFlowDiagram from '@/components/ChainFlowDiagram';

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

interface AgentStats {
  agent_name: string;
  call_count: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  failure_count: number;
  failure_rate: number;
  avg_quality_score: number;
}

export default function AgentChainsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [chainProfile, setChainProfile] = useState<any>(null);
  const [agentStats, setAgentStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      date.setHours(0, 0, 0, 0);
      return date;
    })(),
    to: new Date(),
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadData();
  }, [projectId, selectedChainId, days, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load chain profile
      const profileData = await agentChainAPI.profile(
        projectId,
        selectedChainId || undefined,
        days
      );
      setChainProfile(profileData);

      // Load agent statistics
      const statsData = await agentChainAPI.getAgentStatistics(projectId, days);
      setAgentStats(statsData);
    } catch (error: any) {
      console.error('Failed to load agent chain data:', error);
      if (error.response?.status === 403) {
        toast.showToast('Agent Chain Profiling requires Pro plan or higher. Please upgrade your subscription.', 'error');
      } else {
        toast.showToast(error.response?.data?.detail || 'Failed to load agent chain data', 'error');
      }
      if (error.response?.status === 401) {
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

  // Handle subscription upgrade required
  if (chainProfile?.message === 'Agent Chain Profiling requires Pro plan or higher') {
    return (
      <DashboardLayout>
        <div className="bg-[#000314] min-h-screen">
          <ProjectTabs projectId={projectId} />
          <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-12 text-center shadow-2xl">
            <GitBranch className="h-16 w-16 text-purple-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Subscription Upgrade Required</h2>
            <p className="text-slate-400 mb-6">
              Agent Chain Profiling is available for Pro plan and above.
            </p>
            <Button onClick={() => router.push('/settings/billing')}>
              Upgrade Plan
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const chains = chainProfile?.chains || [];
  const agents = agentStats?.agents || [];

  const COLORS = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">Agent Chains</h1>
          <p className="text-slate-400 mt-2">Monitor and analyze multi-agent pipeline performance</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Filters */}
        <div className="mb-6 flex items-center gap-4">
          <DateRangePicker
            value={dateRange}
            onChange={(range) => {
              setDateRange(range);
              if (range.from && range.to) {
                const diffTime = Math.abs(range.to.getTime() - range.from.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                setDays(diffDays);
              }
            }}
            showPeriodLabel={true}
          />
          <Select
            value={selectedChainId === null ? '' : selectedChainId}
            onChange={(value) => setSelectedChainId(value === '' ? null : value)}
            placeholder={chains.length === 0 ? 'No chains available' : 'All Chains'}
            options={chains.length > 0 ? [
              { value: '', label: 'All Chains' },
              ...chains.map((chain: ChainProfile) => ({
                value: chain.chain_id,
                label: `${chain.chain_id.substring(0, 12)}... (${chain.total_steps} steps, ${chain.unique_agents} agents)`,
              })),
            ] : []}
            className="min-w-[280px]"
            disabled={chains.length === 0}
          />
        </div>

        {/* Overview Stats */}
        {chainProfile && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Total Chains</p>
                  <p className="text-2xl font-bold text-white">{chainProfile.total_chains || 0}</p>
                </div>
                <GitBranch className="h-8 w-8 text-purple-400" />
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Success Rate</p>
                  <p className="text-2xl font-bold text-white">
                    {chainProfile.success_rate?.toFixed(1) || 0}%
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Avg Chain Latency</p>
                  <p className="text-2xl font-bold text-white">
                    {chainProfile.avg_chain_latency_ms
                      ? `${(chainProfile.avg_chain_latency_ms / 1000).toFixed(2)}s`
                      : 'N/A'}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-cyan-400" />
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Active Agents</p>
                  <p className="text-2xl font-bold text-white">{agentStats?.total_agents || 0}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-400" />
              </div>
            </div>
          </div>
        )}

        {/* Agent Statistics Chart */}
        {agents.length > 0 && (
          <div className="mb-6 relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">Agent Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={agents.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis
                  dataKey="agent_name"
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
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
                <Bar dataKey="success_rate" fill="#10b981" name="Success Rate (%)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chains List */}
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Chain Profiles</h2>
            {chains.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No chain data available for the selected period.</p>
                <p className="text-sm mt-2">Chains are created when API calls share the same chain_id.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chains.map((chain: ChainProfile) => (
                  <div
                    key={chain.chain_id}
                    className="border border-white/10 bg-white/5 rounded-lg p-6 hover:bg-white/10 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/${projectId}/chains/${chain.chain_id}`)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-white">
                            Chain: {chain.chain_id.substring(0, 12)}...
                          </h3>
                          {chain.success ? (
                            <Badge variant="success">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="error">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-400">
                          {new Date(chain.first_call_at).toLocaleString()} -{' '}
                          {new Date(chain.last_call_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/${projectId}/chains/${chain.chain_id}`);
                        }}
                      >
                        View Details <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>

                    {/* Chain Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Total Steps</p>
                        <p className="text-lg font-semibold text-white">{chain.total_steps}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Unique Agents</p>
                        <p className="text-lg font-semibold text-white">{chain.unique_agents}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Total Latency</p>
                        <p className="text-lg font-semibold text-white">
                          {(chain.total_latency / 1000).toFixed(2)}s
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Success Rate</p>
                        <p className="text-lg font-semibold text-white">
                          {chain.success_rate.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* Bottleneck */}
                    {chain.bottleneck_agent && (
                      <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-400" />
                          <span className="text-sm text-yellow-400">
                            Bottleneck: <strong>{chain.bottleneck_agent}</strong> (
                            {(chain.bottleneck_latency_ms / 1000).toFixed(2)}s avg latency)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Agent Flow Diagram */}
                    {chain.agents && chain.agents.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wide">Agent Flow</p>
                        <ChainFlowDiagram
                          agents={chain.agents}
                          totalLatency={chain.total_latency}
                          successRate={chain.success_rate}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
