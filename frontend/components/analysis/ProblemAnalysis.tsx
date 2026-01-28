'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle, Map } from 'lucide-react';
import { problemAnalysisAPI, mappingAPI } from '@/lib/api';
import AgentMap from '@/components/mapping/AgentMap';
import UpgradePrompt from '@/components/subscription/UpgradePrompt';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import { clsx } from 'clsx';

interface ProblemNode {
  id: string;
  name: string;
  problem_reasons: string[];
  severity: number;
  metrics: {
    score: number;
    latency: number;
    call_count: number;
    success_rate: number;
  };
}

interface ProblemAnalysisProps {
  projectId: number;
  onClose?: () => void;
}

export default function ProblemAnalysis({ projectId, onClose }: ProblemAnalysisProps) {
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
        const data = await problemAnalysisAPI.analyzeProblems(projectId);
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
          setError(err.message || 'Failed to analyze problems');
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
    return 'text-sky-300 bg-sky-500/10 border-sky-500/30';
  };

  const getSeverityIcon = (severity: number) => {
    if (severity >= 0.7) return <XCircle className="w-5 h-5 text-red-300" />;
    if (severity >= 0.4) return <AlertCircle className="w-5 h-5 text-amber-300" />;
    return <CheckCircle className="w-5 h-5 text-sky-300" />;
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
          feature="Problem Analysis"
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

  const problemNodes = analysis.problem_nodes || [];

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Problem Analysis</h2>
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

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Total Nodes</div>
            <div className="text-2xl font-bold text-white">{analysis.total_nodes}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Problem Nodes</div>
            <div className="text-2xl font-bold text-red-500">{analysis.problem_count}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Health Rate</div>
            <div className="text-2xl font-bold text-green-500">
              {analysis.total_nodes > 0
                ? (((analysis.total_nodes - analysis.problem_count) / analysis.total_nodes) * 100).toFixed(0)
                : 100}
              %
            </div>
          </div>
        </div>

        {/* Problem Nodes List */}
        {problemNodes.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white mb-3">Problem Nodes</h3>
            {problemNodes.map((node: ProblemNode) => (
              <div
                key={node.id}
                className={clsx(
                  'p-4 rounded-lg border-2',
                  getSeverityColor(node.severity)
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getSeverityIcon(node.severity)}
                    <h4 className="font-semibold text-ag-text">{node.name}</h4>
                  </div>
                  <span className="text-xs text-ag-muted">
                    Severity: {(node.severity * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="space-y-1 text-sm text-ag-text">
                  {node.problem_reasons.map((reason, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-current rounded-full" />
                      {reason}
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-ag-muted">Score:</span>
                    <span className="ml-2 font-medium">{node.metrics.score.toFixed(1)}/5.0</span>
                  </div>
                  <div>
                    <span className="text-ag-muted">Latency:</span>
                    <span className="ml-2 font-medium">{node.metrics.latency.toFixed(0)}ms</span>
                  </div>
                  <div>
                    <span className="text-ag-muted">Success:</span>
                    <span className="ml-2 font-medium">{(node.metrics.success_rate * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-lg font-medium">No problems detected!</p>
            <p className="text-sm mt-1">All agents are performing well.</p>
          </div>
        )}
      </div>

      {/* Map Visualization (Pro only) */}
      {showMap && analysis.mapping_available && mappingData && (
        <div className="h-[600px] bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <AgentMap
            projectId={projectId}
            nodes={mappingData.nodes || []}
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
            feature="Problem Analysis Map"
            requiredPlan="pro"
          />
        </div>
      )}
    </div>
  );
}
