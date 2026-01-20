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
import { ArrowLeft, ArrowRight, Clock, CheckCircle, XCircle, Activity, AlertTriangle, TrendingUp, TrendingDown, Sparkles, Zap } from 'lucide-react';
import Modal from '@/components/ui/Modal';
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
  // Normalized to always be a number when we build state
  avg_quality_score: number;
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
  bottleneck_severity?: string; // Optional - severity level: "none" | "low" | "medium" | "high" | "critical"
  agents: AgentStats[];
  first_call_at?: string; // Optional - may not be in API response
  last_call_at?: string; // Optional - may not be in API response
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
  const [optimizations, setOptimizations] = useState<any>(null);
  const [loadingOptimizations, setLoadingOptimizations] = useState(false);
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);

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
      const profileData = await agentChainAPI.profile(projectId, chainId, 30) as any;
      
      // Handle response structure: {chains: [...], ...} or direct chain object
      if (profileData && typeof profileData === 'object') {
        if (Array.isArray(profileData.chains) && profileData.chains.length > 0) {
          const chainData = profileData.chains[0] as any;
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
            first_call_at: chainData.first_call_at ?? new Date().toISOString(),
            last_call_at: chainData.last_call_at ?? new Date().toISOString(),
          });
        } else if (profileData.chain_id) {
          // Direct chain object (not wrapped in chains array)
          const chainData = profileData as any;
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
            first_call_at: chainData.first_call_at ?? new Date().toISOString(),
            last_call_at: chainData.last_call_at ?? new Date().toISOString(),
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
        
        // Load optimizations
        loadOptimizations();
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
  
  const loadOptimizations = async () => {
    if (!chainId) return;
    
    setLoadingOptimizations(true);
    try {
      const result = await agentChainAPI.getOptimizations(projectId, chainId);
      setOptimizations(result);
    } catch (error: any) {
      console.error('Failed to load optimizations:', error);
      // Don't show error toast - optimizations are optional
    } finally {
      setLoadingOptimizations(false);
    }
  };
  
  const handleApplyOptimization = async (optimizationId: string) => {
    if (!chainId) return;
    
    try {
      const result = await agentChainAPI.applyOptimization(projectId, chainId, optimizationId, true);
      toast.showToast('Optimization applied successfully', 'success');
      setShowOptimizationModal(false);
      // Reload chain to see updates
      loadChain();
    } catch (error: any) {
      console.error('Failed to apply optimization:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to apply optimization', 'error');
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
              {chain.first_call_at ? new Date(chain.first_call_at).toLocaleString() : 'N/A'} - {chain.last_call_at ? new Date(chain.last_call_at).toLocaleString() : 'N/A'}
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
          <div className={clsx(
            "mb-6 relative rounded-2xl border backdrop-blur-sm p-6 shadow-2xl",
            chain.bottleneck_severity === "critical" ? "border-red-500/30 bg-red-500/10" :
            chain.bottleneck_severity === "high" ? "border-orange-500/30 bg-orange-500/10" :
            "border-yellow-500/30 bg-yellow-500/10"
          )}>
            <div className="flex items-center gap-3">
              <AlertTriangle className={clsx(
                "h-6 w-6",
                chain.bottleneck_severity === "critical" ? "text-red-400" :
                chain.bottleneck_severity === "high" ? "text-orange-400" :
                "text-yellow-400"
              )} />
              <div className="flex-1">
                <h3 className={clsx(
                  "text-lg font-semibold mb-1",
                  chain.bottleneck_severity === "critical" ? "text-red-400" :
                  chain.bottleneck_severity === "high" ? "text-orange-400" :
                  "text-yellow-400"
                )}>
                  Bottleneck Detected ({chain.bottleneck_severity || "medium"})
                </h3>
                <p className={clsx(
                  "text-sm",
                  chain.bottleneck_severity === "critical" ? "text-red-300" :
                  chain.bottleneck_severity === "high" ? "text-orange-300" :
                  "text-yellow-300"
                )}>
                  Agent <strong>{chain.bottleneck_agent}</strong> is the slowest component with an average latency of{' '}
                  <strong>{toFixedSafe(chain.bottleneck_latency_ms / 1000, 2)}s</strong>.
                  Consider optimizing this agent for better overall chain performance.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOptimizationModal(true)}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                View Optimizations
              </Button>
            </div>
          </div>
        )}

        {/* Optimization Suggestions */}
        {optimizations && optimizations.suggestions && optimizations.suggestions.length > 0 && (
          <div className="mb-6 relative rounded-2xl border border-purple-500/30 bg-purple-500/10 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-purple-400" />
                <h3 className="text-lg font-semibold text-purple-400">Optimization Suggestions</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOptimizationModal(true)}
              >
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {optimizations.suggestions.slice(0, 2).map((opt: any, idx: number) => (
                <div key={idx} className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white mb-1">
                        {opt.type === "parallelization" && "Parallelization Opportunity"}
                        {opt.type === "order_optimization" && "Order Optimization"}
                        {opt.type === "model_optimization" && "Model Optimization"}
                        {opt.type === "cost_optimization" && "Cost Optimization"}
                      </div>
                      <p className="text-sm text-slate-400">{opt.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-300">
                        {opt.improvement_percentage && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {opt.improvement_percentage > 0 ? '+' : ''}{opt.improvement_percentage}% improvement
                          </span>
                        )}
                        <Badge variant={opt.risk_level === "low" ? "success" : opt.risk_level === "medium" ? "warning" : "error"}>
                          {opt.risk_level} risk
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {optimizations.predicted_improvement && (
              <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-sm font-medium text-white mb-2">Predicted Overall Improvement</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-slate-400">Latency Reduction</div>
                    <div className="text-lg font-bold text-green-400">
                      {optimizations.predicted_improvement.latency_reduction_percentage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Cost Reduction</div>
                    <div className="text-lg font-bold text-green-400">
                      {optimizations.predicted_improvement.cost_reduction_percentage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Success Rate</div>
                    <div className="text-lg font-bold text-green-400">
                      +{optimizations.predicted_improvement.success_rate_improvement_percentage}%
                    </div>
                  </div>
                </div>
              </div>
            )}
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

        {/* Optimization Modal */}
        {showOptimizationModal && optimizations && (
          <Modal
            isOpen={showOptimizationModal}
            onClose={() => setShowOptimizationModal(false)}
            title="Optimization Suggestions"
            size="xl"
          >
            <div className="space-y-4">
              {optimizations.suggestions && optimizations.suggestions.length > 0 ? (
                <>
                  {optimizations.suggestions.map((opt: any, idx: number) => (
                    <div key={idx} className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-white">
                          {opt.type === "parallelization" && "Parallelization Opportunity"}
                          {opt.type === "order_optimization" && "Order Optimization"}
                          {opt.type === "model_optimization" && "Model Optimization"}
                          {opt.type === "cost_optimization" && "Cost Optimization"}
                        </div>
                        <Badge variant={opt.risk_level === "low" ? "success" : opt.risk_level === "medium" ? "warning" : "error"}>
                          {opt.risk_level} risk
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400 mb-3">{opt.description}</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {opt.improvement_percentage && (
                          <div>
                            <span className="text-slate-400">Improvement: </span>
                            <span className="text-green-400 font-medium">
                              {opt.improvement_percentage > 0 ? '+' : ''}{opt.improvement_percentage}%
                            </span>
                          </div>
                        )}
                        {opt.current_latency_ms && opt.optimized_latency_ms && (
                          <div>
                            <span className="text-slate-400">Latency: </span>
                            <span className="text-white">
                              {toFixedSafe(opt.current_latency_ms / 1000, 2)}s → {toFixedSafe(opt.optimized_latency_ms / 1000, 2)}s
                            </span>
                          </div>
                        )}
                      </div>
                      {opt.requires_approval && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <Button
                            size="sm"
                            onClick={() => handleApplyOptimization(opt.type + '_' + idx)}
                            className="w-full"
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            Apply This Optimization
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {optimizations.predicted_improvement && (
                    <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
                      <div className="text-sm font-medium text-purple-400 mb-3">Predicted Overall Improvement</div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-slate-400">Latency Reduction</div>
                          <div className="text-lg font-bold text-green-400">
                            {optimizations.predicted_improvement.latency_reduction_percentage}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Cost Reduction</div>
                          <div className="text-lg font-bold text-green-400">
                            {optimizations.predicted_improvement.cost_reduction_percentage}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Success Rate</div>
                          <div className="text-lg font-bold text-green-400">
                            +{optimizations.predicted_improvement.success_rate_improvement_percentage}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No optimization suggestions available at this time.</p>
                </div>
              )}
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
