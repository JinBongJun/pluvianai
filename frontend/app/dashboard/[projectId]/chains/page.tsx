'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Select from '@/components/ui/Select';
import { agentChainAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Activity, Clock, CheckCircle, XCircle, GitBranch, Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { clsx } from 'clsx';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'first_call_at' | 'success_rate' | 'total_latency' | 'total_steps'>('first_call_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadData();
  }, [projectId, selectedChainId, days, router]);

  // Reload when date range changes
  useEffect(() => {
    if (dateRange.from && dateRange.to) {
      const diffTime = Math.abs(dateRange.to.getTime() - dateRange.from.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays !== days) {
        setDays(diffDays);
      }
    }
  }, [dateRange.from, dateRange.to]);

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

  const allChains = chainProfile?.chains || [];
  const agents = agentStats?.agents || [];

  // Filter chains by search query
  const filteredChains = useMemo(() => {
    let filtered = allChains;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((chain: ChainProfile) => {
        return (
          chain.chain_id.toLowerCase().includes(query) ||
          chain.agents?.some((agent: AgentStats) => 
            agent.agent_name?.toLowerCase().includes(query)
          )
        );
      });
    }
    
    // Sort chains
    filtered.sort((a: ChainProfile, b: ChainProfile) => {
      let aVal: any;
      let bVal: any;
      
      switch (sortField) {
        case 'first_call_at':
          aVal = new Date(a.first_call_at).getTime();
          bVal = new Date(b.first_call_at).getTime();
          break;
        case 'success_rate':
          aVal = a.success_rate;
          bVal = b.success_rate;
          break;
        case 'total_latency':
          aVal = a.total_latency;
          bVal = b.total_latency;
          break;
        case 'total_steps':
          aVal = a.total_steps;
          bVal = b.total_steps;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  }, [allChains, searchQuery, sortField, sortDirection]);

  // Paginate chains
  const totalItems = filteredChains.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedChains = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredChains.slice(startIndex, endIndex);
  }, [filteredChains, currentPage, itemsPerPage]);

  const chains = paginatedChains;
  const allChainsForSelect = allChains;

  const COLORS = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  const handleExport = () => {
    const data = {
      chains: filteredChains,
      stats: chainProfile,
      exported_at: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-chains-${projectId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.showToast('Chain data exported successfully', 'success');
  };

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

        {/* Filters and Actions */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center gap-4 flex-wrap">
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
              onChange={(value) => {
                setSelectedChainId(value === '' ? null : value);
                setCurrentPage(1); // Reset to first page when filtering
              }}
              placeholder={allChainsForSelect.length === 0 ? 'No chains available' : 'All Chains'}
              options={allChainsForSelect.length > 0 ? [
                { value: '', label: 'All Chains' },
                ...allChainsForSelect.map((chain: ChainProfile) => ({
                  value: chain.chain_id,
                  label: `${chain.chain_id.substring(0, 16)}... (${chain.total_steps} steps, ${chain.unique_agents} agents)`,
                })),
              ] : []}
              className="min-w-[280px]"
              disabled={allChainsForSelect.length === 0}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {filteredChains.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
          </div>
          
          {/* Search and Sort */}
          {allChainsForSelect.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search by chain ID or agent name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1); // Reset to first page when searching
                  }}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Sort by:</span>
                <Select
                  value={sortField}
                  onChange={(value) => value && handleSort(value as typeof sortField)}
                  placeholder="Sort..."
                  options={[
                    { value: 'first_call_at', label: 'Time' },
                    { value: 'success_rate', label: 'Success Rate' },
                    { value: 'total_latency', label: 'Total Latency' },
                    { value: 'total_steps', label: 'Total Steps' },
                  ]}
                  className="min-w-[150px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1"
                >
                  {sortDirection === 'asc' ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Chain Profiles
                {filteredChains.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    ({filteredChains.length} {filteredChains.length === 1 ? 'chain' : 'chains'})
                  </span>
                )}
              </h2>
              {allChainsForSelect.length > filteredChains.length && (
                <span className="text-sm text-slate-400">
                  Showing {filteredChains.length} of {allChainsForSelect.length}
                </span>
              )}
            </div>
            {filteredChains.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {searchQuery ? (
                  <>
                    <p>No chains found matching "{searchQuery}"</p>
                    <p className="text-sm mt-2">Try adjusting your search query.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery('')}
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  </>
                ) : allChainsForSelect.length === 0 ? (
                  <>
                    <p>No chain data available for the selected period.</p>
                    <p className="text-sm mt-2">Chains are created when API calls share the same chain_id.</p>
                  </>
                ) : (
                  <>
                    <p>No chains match the current filters.</p>
                    <p className="text-sm mt-2">Try adjusting your filters.</p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {chains.map((chain: ChainProfile) => (
                    <div
                      key={chain.chain_id}
                      className="border border-white/10 bg-white/5 rounded-lg p-6 hover:bg-white/10 transition-colors cursor-pointer"
                      onClick={() => router.push(`/dashboard/${projectId}/chains/${chain.chain_id}`)}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 
                              className="text-lg font-semibold text-white font-mono text-sm"
                              title={chain.chain_id}
                            >
                              Chain: {chain.chain_id.substring(0, 20)}...
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
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={setItemsPerPage}
                      className="bg-transparent"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
