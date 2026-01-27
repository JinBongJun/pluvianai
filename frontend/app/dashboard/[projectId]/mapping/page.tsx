'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { mappingAPI } from '@/lib/api';
import AgentMap from '@/components/mapping/AgentMap';
import NodeDetail from '@/components/mapping/NodeDetail';
import LoadingSpinner from '@/components/LoadingSpinner';
import UpgradePrompt from '@/components/subscription/UpgradePrompt';
import MapRenderFailedState from '@/components/states/MapRenderFailedState';
import { Filter, Search, Focus } from 'lucide-react';
import { clsx } from 'clsx';

interface NodeMetrics {
  score: number;
  latency: number;
  call_count: number;
  success_rate: number;
}

interface AgentNode {
  id: string;
  name: string;
  type: string;
  provider?: string;
  model?: string;
  metrics: NodeMetrics;
}

interface AgentEdge {
  from: string;
  to: string;
  call_count: number;
  avg_latency: number;
}

export default function MappingPage() {
  const params = useParams();
  const projectId = Number(params.projectId);

  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [edges, setEdges] = useState<AgentEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);
  const [showNodeDetail, setShowNodeDetail] = useState(false);
  const [days, setDays] = useState(7);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    min_score: undefined as number | undefined,
    max_latency: undefined as number | undefined,
    has_problems: undefined as boolean | undefined,
  });

  const fetchMapping = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await mappingAPI.getMapping(projectId, days);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err: any) {
      if (err.response?.status === 403 && err.response?.headers?.['x-upgrade-required']) {
        setError('upgrade_required');
      } else {
        setError(err.message || 'Failed to load mapping data');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchMapping();
  }, [projectId, days]);

  // Handle node click
  const handleNodeClick = async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    try {
      const details = await mappingAPI.getNodeDetails(projectId, nodeId, days);
      setSelectedNodeDetails(details);
      setShowNodeDetail(true);
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load node details:', err);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(err as Error, { extra: { projectId, nodeId } });
        });
      }
    }
  };

  // Apply filters
  const applyFilters = async () => {
    setLoading(true);
    setError(null);
    try {
      const filterParams: any = {};
      if (searchQuery) filterParams.agent_name = searchQuery;
      if (filters.min_score !== undefined) filterParams.min_score = filters.min_score;
      if (filters.max_latency !== undefined) filterParams.max_latency = filters.max_latency;
      if (filters.has_problems !== undefined) filterParams.has_problems = filters.has_problems;

      const data = await mappingAPI.filterMapping(projectId, filterParams, days);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err: any) {
      setError(err.message || 'Failed to filter mapping data');
    } finally {
      setLoading(false);
    }
  };

  // Handle upgrade required
  if (error === 'upgrade_required') {
    return (
      <div className="p-6">
        <UpgradePrompt
          isOpen={true}
          onClose={() => {}}
          feature="Auto-Mapping"
          requiredPlan="pro"
        />
      </div>
    );
  }

  if (loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && error !== 'upgrade_required') {
    return (
      <div className="p-6">
        <MapRenderFailedState
          description={error}
          onRetry={fetchMapping}
          retryLabel="Retry"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Map</h1>
          <p className="text-slate-400 mt-1">Visualize your agent structure and dependencies</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Days selector */}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
          >
            <option value={1}>Last 1 day</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  applyFilters();
                }
              }}
              className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm w-64"
            />
          </div>

          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              showFilters
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
            )}
          >
            <Filter className="w-4 h-4 inline mr-2" />
            Filters
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Min Score</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={filters.min_score || ''}
                onChange={(e) =>
                  setFilters({ ...filters, min_score: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Max Latency (ms)</label>
              <input
                type="number"
                min="0"
                value={filters.max_latency || ''}
                onChange={(e) =>
                  setFilters({ ...filters, max_latency: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="No limit"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Show Problems Only</label>
              <input
                type="checkbox"
                checked={filters.has_problems || false}
                onChange={(e) => setFilters({ ...filters, has_problems: e.target.checked || undefined })}
                className="w-4 h-4 text-purple-600 bg-slate-900 border-slate-700 rounded"
              />
            </div>
          </div>
          <button
            onClick={applyFilters}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      )}

      {/* Map */}
      <div className="h-[600px] bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        <AgentMap
          projectId={projectId}
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
        />
      </div>

      {/* Node Detail Modal */}
      {showNodeDetail && selectedNodeDetails && (
        <NodeDetail
          nodeId={selectedNodeId || ''}
          nodeName={selectedNodeDetails.node_id || ''}
          metrics={selectedNodeDetails.metrics || {}}
          recentMessages={selectedNodeDetails.recent_messages || []}
          isOpen={showNodeDetail}
          onClose={() => {
            setShowNodeDetail(false);
            setSelectedNodeId(null);
            setSelectedNodeDetails(null);
          }}
        />
      )}
    </div>
  );
}
