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
import { ArrowLeft, ArrowRight, Clock, CheckCircle, XCircle, Activity, AlertTriangle, TrendingUp, TrendingDown, Sparkles, Zap, HelpCircle } from 'lucide-react';
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

// SCHEMA_SPEC.md compliant - 2026-01-31
interface AgentStats {
  agent_name: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;  // 0.0 ~ 1.0
  avg_latency_ms: number;
}

// SCHEMA_SPEC.md compliant - 2026-01-31
interface ChainProfile {
  chain_id: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;  // 0.0 ~ 1.0
  avg_latency_ms: number;
  total_cost: number;
  avg_cost_per_call: number;
  // Extended fields
  unique_agents: number;
  total_latency_ms: number;
  bottleneck_agent: string | null;
  bottleneck_latency_ms: number;
  // Optional severity classification for bottleneck (low/medium/high/critical)
  bottleneck_severity?: 'low' | 'medium' | 'high' | 'critical';
  agents: AgentStats[];
  first_call_at?: string;
  last_call_at?: string;
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
  const [showOptimizations, setShowOptimizations] = useState(false);

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
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to load related calls:', error);
          } else {
            import('@sentry/nextjs').then((Sentry) => {
              Sentry.captureException(error as Error, { extra: { projectId, chainId } });
            });
          }
        }
        
        // Load optimizations
        loadOptimizations();
      } else {
        toast.showToast('Chain not found', 'error');
        router.push(`/dashboard/${projectId}/chains`);
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load chain:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, chainId } });
        });
      }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load optimizations:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, chainId } });
        });
      }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to apply optimization:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, chainId, optimizationId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to apply optimization', 'error');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ag-accent border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!chain) {
    return (
      <DashboardLayout>
        <div className="bg-ag-bg min-h-screen">
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Chain Not Found</h3>
            <p className="text-slate-400 mb-4">
              The chain you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
            </p>
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
      <div className="bg-ag-bg min-h-screen">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/dashboard/${projectId}/chains`)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-white">Agent Chain Details</h1>
                <p className="text-slate-400 mt-1 text-sm">
                  Analyze performance, bottlenecks, and optimization opportunities for multi-agent pipelines
                </p>
              </div>
            </div>
            {chain.success_rate >= 0.9 ? (
              <Badge variant="success" className="text-xs">Healthy</Badge>
            ) : chain.success_rate >= 0.5 ? (
              <Badge variant="warning" className="text-xs">Degraded</Badge>
            ) : (
              <Badge variant="error" className="text-xs">Failing</Badge>
            )}
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Overview Stats */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold text-white">Key Metrics</h2>
            <div className="group relative">
              <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
              <div className="absolute left-0 top-6 w-64 p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <p><strong>Calls:</strong> Total API calls in this chain<br/>
                <strong>Agents:</strong> Number of unique agents used<br/>
                <strong>Latency:</strong> Total chain execution time<br/>
                <strong>Success:</strong> Successfully completed ratio</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-slate-400 mb-1">Calls</p>
              <p className="text-lg font-bold text-white">{chain.total_calls}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total API calls</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-slate-400 mb-1">Agents</p>
              <p className="text-lg font-bold text-white">{chain.unique_agents}</p>
              <p className="text-xs text-slate-500 mt-0.5">Unique agents</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-slate-400 mb-1">Latency</p>
              <p className="text-lg font-bold text-white">{toFixedSafe(chain.total_latency_ms / 1000, 2)}s</p>
              <p className="text-xs text-slate-500 mt-0.5">Total execution time</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-slate-400 mb-1">Success</p>
              <p className={clsx(
                'text-lg font-bold',
                chain.success_rate >= 0.9 ? 'text-green-400' :
                chain.success_rate >= 0.7 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {toFixedSafe(chain.success_rate * 100, 1)}%
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Success rate</p>
            </div>
          </div>
        </div>

        {/* Bottleneck Warning */}
        {chain.bottleneck_agent && (
          <div className={clsx(
            "mb-4 rounded-lg border p-3",
            chain.bottleneck_severity === "critical" ? "border-red-500/30 bg-red-500/10" :
            chain.bottleneck_severity === "high" ? "border-orange-500/30 bg-orange-500/10" :
            "border-yellow-500/30 bg-yellow-500/10"
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className={clsx(
                  "h-4 w-4",
                  chain.bottleneck_severity === "critical" ? "text-red-400" :
                  chain.bottleneck_severity === "high" ? "text-orange-400" :
                  "text-yellow-400"
                )} />
                <span className={clsx(
                  "text-sm font-medium",
                  chain.bottleneck_severity === "critical" ? "text-red-400" :
                  chain.bottleneck_severity === "high" ? "text-orange-400" :
                  "text-yellow-400"
                )}>
                  Bottleneck Detected
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOptimizationModal(true)}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Optimize
              </Button>
            </div>
            <p className="text-xs text-slate-300 mb-1">
              Agent <strong>{chain.bottleneck_agent}</strong> is the slowest with an average latency of {toFixedSafe(chain.bottleneck_latency_ms / 1000, 2)}s.
            </p>
            <p className="text-xs text-slate-400">
              View optimization suggestions to improve chain performance.
            </p>
          </div>
        )}

        {/* Optimization Suggestions - Collapsible */}
        {optimizations && optimizations.suggestions && optimizations.suggestions.length > 0 && (
          <div className="mb-4 rounded-lg border border-ag-accent/30 bg-ag-accent/10">
            <button
              onClick={() => setShowOptimizations(!showOptimizations)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-ag-accent/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-ag-accent" />
                <div>
                  <span className="text-sm font-medium text-ag-accent block">
                    {optimizations.suggestions.length} Optimization Suggestions
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">
                    Click to view performance improvement opportunities
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {optimizations.predicted_improvement && (
                  <span className="text-xs text-green-400 font-medium">
                    {optimizations.predicted_improvement.latency_reduction_percentage}% improvement expected
                  </span>
                )}
                <TrendingUp className={clsx("h-4 w-4 text-slate-400 transition-transform", showOptimizations && "rotate-180")} />
              </div>
            </button>
            {showOptimizations && (
              <div className="p-3 pt-0 border-t border-ag-accent/20 space-y-2">
                {optimizations.suggestions.slice(0, 2).map((opt: any, idx: number) => (
                  <div key={idx} className="p-2 bg-white/5 rounded text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium">
                        {opt.type === "parallelization" && "Parallelize"}
                        {opt.type === "order_optimization" && "Reorder"}
                        {opt.type === "model_optimization" && "Optimize Model"}
                        {opt.type === "cost_optimization" && "Reduce Cost"}
                      </span>
                      {opt.improvement_percentage && (
                        <span className="text-green-400">
                          {opt.improvement_percentage > 0 ? '+' : ''}{opt.improvement_percentage}%
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs">{opt.description}</p>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOptimizationModal(true)}
                  className="w-full text-xs"
                >
                  View All {optimizations.suggestions.length} Suggestions
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Chain Flow Diagram */}
        {chain.agents && chain.agents.length > 0 && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Agent Flow</h3>
            <ChainFlowDiagram
              agents={chain.agents}
              totalLatency={chain.total_latency_ms}
              successRate={chain.success_rate * 100}
            />
          </div>
        )}

        {/* Agent Performance Chart */}
        {chain.agents && chain.agents.length > 0 && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Performance</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chain.agents.map(a => ({
                ...a,
                success_rate_percent: a.success_rate * 100,
              }))}>
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
                <Bar dataKey="success_rate_percent" fill="#10b981" name="Success Rate (%)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Agent Statistics Table */}
        {chain.agents && chain.agents.length > 0 && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
            <div className="p-3 border-b border-white/10">
              <h3 className="text-sm font-medium text-slate-400">Agents</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Agent</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Calls</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Latency</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Success</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {chain.agents.map((agent: AgentStats) => (
                    <tr key={agent.agent_name} className="hover:bg-white/5">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white">{agent.agent_name}</span>
                          {agent.agent_name === chain.bottleneck_agent && (
                            <Badge variant="warning" className="text-xs">Bottleneck</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-white">
                        {agent.total_calls}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-white">
                        {toFixedSafe(agent.avg_latency_ms / 1000, 2)}s
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-white">
                        {toFixedSafe(agent.success_rate * 100, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Related API Calls - Simplified */}
        {relatedCalls.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-400">Related Calls ({relatedCalls.length})</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/dashboard/${projectId}/api-calls?chain_id=${chainId}`)}
              >
                View All
              </Button>
            </div>
            <div className="p-3 space-y-2">
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
                    <div className="p-4 bg-ag-accent/10 rounded-lg border border-ag-accent/30">
                      <div className="text-sm font-medium text-ag-accent mb-3">Predicted Overall Improvement</div>
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
