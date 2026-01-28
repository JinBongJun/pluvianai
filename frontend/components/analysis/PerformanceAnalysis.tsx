'use client';

import { useState, useEffect } from 'react';
import { Gauge, Map, Clock, TrendingUp } from 'lucide-react';
import { performanceAnalysisAPI, mappingAPI } from '@/lib/api';
import AgentMap from '@/components/mapping/AgentMap';
import UpgradePrompt from '@/components/subscription/UpgradePrompt';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import { clsx } from 'clsx';

interface BottleneckNode {
  id: string;
  name: string;
  latency_stats: {
    avg: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    count: number;
  };
  bottleneck_reason: string;
  severity: number;
}

interface PerformanceAnalysisProps {
  projectId: number;
  onClose?: () => void;
}

export default function PerformanceAnalysis({ projectId, onClose }: PerformanceAnalysisProps) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [mappingData, setMappingData] = useState<any>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await performanceAnalysisAPI.analyzePerformance(projectId);
        setAnalysis(data);
        
        // If mapping is available, fetch it
        if (data.mapping_available) {
          const mapping = await mappingAPI.getMapping(projectId);
          setMappingData(mapping);
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
          setError('upgrade_required');
        } else {
          setError(err.message || 'Failed to analyze performance');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [projectId]);

  const getSeverityColor = (severity: number) => {
    if (severity >= 0.7) return 'text-red-300 bg-red-500/10 border-red-500/30';
    if (severity >= 0.4) return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
    return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
  };

  const formatLatency = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(0)}ms`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (error === 'upgrade_required') {
    return (
      <div className="p-6">
        <UpgradePrompt
          isOpen={true}
          onClose={onClose || (() => {})}
          feature="Performance Analysis"
          requiredPlan="pro"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage message={error} />
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const bottleneckNodes = analysis.bottleneck_nodes || [];
  const globalStats = analysis.global_stats || {};
  const threshold = analysis.threshold || 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Performance Analysis</h2>
          {analysis.mapping_available && (
            <button
              onClick={() => setShowMap(!showMap)}
              className="px-4 py-2 bg-ag-primary text-ag-accent-light rounded-lg text-sm font-medium hover:bg-ag-primaryHover transition-colors flex items-center gap-2"
            >
              <Map className="w-4 h-4" />
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Total Nodes</div>
            <div className="text-2xl font-bold text-white">{analysis.total_nodes || 0}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Bottlenecks</div>
            <div className="text-2xl font-bold text-red-500">{analysis.bottleneck_count || 0}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Avg Latency</div>
            <div className="text-2xl font-bold text-blue-500">
              {globalStats.avg ? formatLatency(globalStats.avg) : 'N/A'}
            </div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">P95 Latency</div>
            <div className="text-2xl font-bold text-ag-accent">
              {globalStats.p95 ? formatLatency(globalStats.p95) : 'N/A'}
            </div>
          </div>
        </div>

        {/* Global Stats */}
        {Object.keys(globalStats).length > 0 && (
          <div className="mb-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              Global Performance Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-400 mb-1">Average</div>
                <div className="text-lg font-semibold text-white">
                  {globalStats.avg ? formatLatency(globalStats.avg) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Median</div>
                <div className="text-lg font-semibold text-white">
                  {globalStats.median ? formatLatency(globalStats.median) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">95th Percentile</div>
                <div className="text-lg font-semibold text-white">
                  {globalStats.p95 ? formatLatency(globalStats.p95) : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">99th Percentile</div>
                <div className="text-lg font-semibold text-white">
                  {globalStats.p99 ? formatLatency(globalStats.p99) : 'N/A'}
                </div>
              </div>
            </div>
            {threshold > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="text-xs text-slate-400">Bottleneck Threshold</div>
                <div className="text-sm font-medium text-yellow-400">
                  {formatLatency(threshold)} (1.5x of P95)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottleneck Nodes List */}
        {bottleneckNodes.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance Bottlenecks
            </h3>
            {bottleneckNodes.map((node: BottleneckNode) => (
              <div
                key={node.id}
                className={clsx(
                  'p-4 rounded-lg border-2',
                  getSeverityColor(node.severity)
                )}
              >
                <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-current" />
                    <h4 className="font-semibold text-ag-text">{node.name}</h4>
                  </div>
                  <span className="text-xs text-ag-muted">
                    Severity: {(node.severity * 100).toFixed(0)}%
                  </span>
                </div>
                
                <div className="mb-3">
                  <p className="text-sm text-ag-text font-medium">{node.bottleneck_reason}</p>
                </div>

                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="text-xs text-ag-muted mb-2">Latency Statistics</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-ag-muted">Average:</span>
                      <span className="ml-2 font-medium text-ag-text">
                        {formatLatency(node.latency_stats.avg)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ag-muted">Median:</span>
                      <span className="ml-2 font-medium text-ag-text">
                        {formatLatency(node.latency_stats.median)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ag-muted">P95:</span>
                      <span className="ml-2 font-medium text-red-600">
                        {formatLatency(node.latency_stats.p95)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ag-muted">P99:</span>
                      <span className="ml-2 font-medium text-red-700">
                        {formatLatency(node.latency_stats.p99)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ag-muted">Min:</span>
                      <span className="ml-2 font-medium text-ag-text">
                        {formatLatency(node.latency_stats.min)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ag-muted">Max:</span>
                      <span className="ml-2 font-medium text-red-800">
                        {formatLatency(node.latency_stats.max)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-ag-muted">Call Count:</span>
                      <span className="ml-2 font-medium text-ag-text">
                        {node.latency_stats.count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <Gauge className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-lg font-medium">No bottlenecks detected!</p>
            <p className="text-sm mt-1">All agents are performing within acceptable latency ranges.</p>
          </div>
        )}
      </div>

      {/* Map Visualization (Pro only) */}
      {showMap && analysis.mapping_available && mappingData && (
        <div className="h-[600px] bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <AgentMap
            projectId={projectId}
            nodes={(mappingData.nodes || []).map((node: any) => {
              const bottleneckNode = bottleneckNodes.find((bn: BottleneckNode) => bn.id === node.id);
              return {
                ...node,
                is_bottleneck: !!bottleneckNode,
                bottleneck_severity: bottleneckNode?.severity,
                latency_stats: bottleneckNode?.latency_stats,
              };
            })}
            edges={mappingData.edges || []}
            enableFilters={true}
            enableFocusMode={true}
          />
        </div>
      )}

      {!analysis.mapping_available && (
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <UpgradePrompt
            isOpen={true}
            onClose={onClose || (() => {})}
            feature="Performance Analysis Map"
            requiredPlan="pro"
          />
        </div>
      )}
    </div>
  );
}
