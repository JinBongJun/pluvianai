'use client';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  MarkerType,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CheckCircle, XCircle, Clock, AlertCircle, MessageSquare, X } from 'lucide-react';
import { clsx } from 'clsx';
import { mappingAPI } from '@/lib/api';
import MapFilters, { MapFilters as MapFiltersType } from './MapFilters';
import FocusModeControls from './FocusModeControls';
import LoadingSpinner from '@/components/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import MapRenderFailedState from '@/components/states/MapRenderFailedState';

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
  // Additional fields for analysis
  is_bottleneck?: boolean;
  bottleneck_severity?: number;
  latency_stats?: {
    avg: number;
    median: number;
    p95: number;
    p99: number;
  };
  dependencies?: string[];
  dependents?: string[];
  depth?: number;
}

interface AgentEdge {
  from: string;
  to: string;
  call_count: number;
  avg_latency: number;
}

interface AgentMapProps {
  projectId: number;
  nodes: AgentNode[];
  edges: AgentEdge[];
  onNodeClick?: (nodeId: string) => void;
  className?: string;
  enableFilters?: boolean;
  enableFocusMode?: boolean;
  days?: number;
}

// Custom node component
function AgentNodeComponent({ data }: { data: AgentNode }) {
  const { metrics } = data;
  const score = metrics.score || 0;
  const latency = metrics.latency || 0;
  const successRate = metrics.success_rate || 0;
  const isBottleneck = data.is_bottleneck || false;
  const dependencies = data.dependencies || [];
  const dependents = data.dependents || [];
  const depth = data.depth !== undefined ? data.depth : null;
  const latencyStats = data.latency_stats;

  // Determine node color based on score or bottleneck status
  const getNodeColor = () => {
    if (isBottleneck) return 'bg-red-500';
    if (score >= 4.0) return 'bg-green-500';
    if (score >= 3.0) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getBorderColor = () => {
    if (isBottleneck) return 'border-red-600 border-4';
    return 'border-gray-300 border-2';
  };

  const getStatusIcon = () => {
    if (isBottleneck) return <Clock className="w-4 h-4 text-red-700" />;
    if (score >= 4.0) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (score >= 3.0) return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    return <XCircle className="w-4 h-4 text-red-600" />;
  };

  return (
    <div
      className={clsx(
        'px-4 py-3 rounded-lg shadow-lg min-w-[200px]',
        getNodeColor(),
        getBorderColor(),
        'bg-white'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-gray-900">{data.name}</h3>
        {getStatusIcon()}
      </div>
      
      {isBottleneck && (
        <div className="mb-2 px-2 py-1 bg-red-100 rounded text-xs font-semibold text-red-800">
          Performance Bottleneck
        </div>
      )}
      
      <div className="space-y-1 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <span>Score:</span>
          <span className="font-medium">{score.toFixed(1)}/5.0</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>
            {latencyStats?.p95 ? `${latencyStats.p95.toFixed(0)}ms (P95)` : `${latency.toFixed(0)}ms`}
          </span>
        </div>
        <div className="text-gray-500">
          {metrics.call_count} calls • {(successRate * 100).toFixed(0)}% success
        </div>
        
        {/* Dependency info */}
        {(dependencies.length > 0 || dependents.length > 0) && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            {dependencies.length > 0 && (
              <div className="text-gray-500 mb-1">
                Depends on: {dependencies.length}
              </div>
            )}
            {dependents.length > 0 && (
              <div className="text-gray-500">
                Dependents: {dependents.length}
              </div>
            )}
            {depth !== null && (
              <div className="text-gray-500 mt-1">
                Depth: {depth}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: AgentNodeComponent,
};

export default function AgentMap({
  projectId,
  nodes: agentNodes,
  edges: agentEdges,
  onNodeClick,
  className,
  enableFilters = false,
  enableFocusMode = false,
  days = 7,
}: AgentMapProps) {
  const [reactFlowNodes, setNodes, onNodesChange] = useNodesState([]);
  const [reactFlowEdges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const reactFlowInstance = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [showNodeDetails, setShowNodeDetails] = useState(false);
  const [selectedNodeData, setSelectedNodeData] = useState<AgentNode | null>(null);
  
  // Filtering state
  const [filters, setFilters] = useState<MapFiltersType>({});
  const [filteredNodes, setFilteredNodes] = useState<AgentNode[]>(agentNodes);
  const [filteredEdges, setFilteredEdges] = useState<AgentEdge[]>(agentEdges);
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Focus Mode state
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(2);
  const [isLoadingSubgraph, setIsLoadingSubgraph] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const [mapRenderError, setMapRenderError] = useState(false);
  
  // Original data (for resetting focus mode)
  const [originalNodes, setOriginalNodes] = useState<AgentNode[]>(agentNodes);
  const [originalEdges, setOriginalEdges] = useState<AgentEdge[]>(agentEdges);

  // Update original data when props change
  useEffect(() => {
    if (!focusNodeId) {
      setOriginalNodes(agentNodes);
      setOriginalEdges(agentEdges);
      // Only update filtered nodes/edges if not in focus mode
      if (!focusNodeId) {
        setFilteredNodes(agentNodes);
        setFilteredEdges(agentEdges);
      }
    }
  }, [agentNodes, agentEdges, focusNodeId]);

  // Apply filters (only when not in focus mode)
  useEffect(() => {
    if (focusNodeId) {
      // In focus mode, don't apply filters (subgraph is already filtered)
      return;
    }

    if (!enableFilters || Object.keys(filters).length === 0) {
      setFilteredNodes(agentNodes);
      setFilteredEdges(agentEdges);
      return;
    }

    const applyFilters = async () => {
      setIsFiltering(true);
      try {
        const result = await mappingAPI.filterMapping(projectId, filters, days);
        setFilteredNodes(result.nodes || []);
        setFilteredEdges(result.edges || []);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          if (process.env.NODE_ENV === 'development') {
          console.error('Failed to filter mapping:', error);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(error as Error, { extra: { projectId, filters } });
          });
        }
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(error as Error, { extra: { projectId, filters } });
          });
        }
        setFilteredNodes(agentNodes);
        setFilteredEdges(agentEdges);
      } finally {
        setIsFiltering(false);
      }
    };

    applyFilters();
  }, [filters, projectId, days, enableFilters, focusNodeId, agentNodes, agentEdges]);

  // Convert agent nodes to ReactFlow nodes
  const flowNodes = useMemo(() => {
    return filteredNodes.map((node, index) => {
      const x = (index % 4) * 250 + 100;
      const y = Math.floor(index / 4) * 150 + 100;

      return {
        id: node.id,
        type: 'agent',
        position: { x, y },
        data: node,
        draggable: true,
        selected: node.id === focusNodeId,
      } as Node;
    });
  }, [filteredNodes, focusNodeId]);

  // Convert agent edges to ReactFlow edges
  const flowEdges = useMemo(() => {
    return filteredEdges.map((edge) => ({
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      label: `${edge.call_count} calls`,
      style: {
        strokeWidth: Math.min(edge.call_count / 10, 5),
      },
    })) as Edge[];
  }, [filteredEdges]);

  // Update ReactFlow nodes and edges when data changes
  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  // Handle node click with smooth animation
  const onNodeClickHandler = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      
      // Show node details modal
      const nodeData = filteredNodes.find(n => n.id === node.id);
      if (nodeData) {
        setSelectedNodeData(nodeData);
        setShowNodeDetails(true);
      }
      
      // If focus mode is enabled, load subgraph
      if (enableFocusMode && node.id !== focusNodeId) {
        setIsLoadingSubgraph(true);
        try {
          const subgraph = await mappingAPI.getSubgraph(projectId, node.id, focusDepth, days);
          setFocusNodeId(node.id);
          setFilteredNodes(subgraph.nodes || []);
          setFilteredEdges(subgraph.edges || []);
          setBreadcrumb([...breadcrumb, node.id]);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to load subgraph:', error);
          } else {
            import('@sentry/nextjs').then((Sentry) => {
              Sentry.captureException(error as Error, { extra: { projectId, focusNodeId } });
            });
          }
        } finally {
          setIsLoadingSubgraph(false);
        }
      }
      
      if (onNodeClick) {
        onNodeClick(node.id);
      }

      // Smooth animation to center the node (0.3s as specified)
      if (reactFlowInstance.current) {
        // Cancel any pending animation
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        // Smooth focus animation (0.3 seconds)
        animationFrameRef.current = requestAnimationFrame(() => {
          reactFlowInstance.current.fitView({
            padding: 0.2,
            duration: 300, // 0.3 seconds
            nodes: [node],
            minZoom: 0.5,
            maxZoom: 2,
          });
        });
      }
    },
    [onNodeClick, enableFocusMode, focusNodeId, focusDepth, projectId, days, breadcrumb, filteredNodes]
  );

  // Handle show full graph
  const handleShowFullGraph = useCallback(() => {
    setFocusNodeId(null);
    setBreadcrumb([]);
    setFilteredNodes(originalNodes);
    setFilteredEdges(originalEdges);
  }, [originalNodes, originalEdges]);

  // Handle depth change in focus mode
  const handleDepthChange = useCallback(async (newDepth: number) => {
    if (!focusNodeId) return;
    
    setFocusDepth(newDepth);
    setIsLoadingSubgraph(true);
    try {
      const subgraph = await mappingAPI.getSubgraph(projectId, focusNodeId, newDepth, days);
      setFilteredNodes(subgraph.nodes || []);
      setFilteredEdges(subgraph.edges || []);
    } catch (error) {
      console.error('Failed to load subgraph:', error);
    } finally {
      setIsLoadingSubgraph(false);
    }
  }, [focusNodeId, projectId, days]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Handle map render errors
  if (mapRenderError) {
    return (
      <MapRenderFailedState
        onRetry={() => {
          setMapRenderError(false);
          // Trigger re-render by resetting state
          window.location.reload();
        }}
        className={className}
      />
    );
  }

  if (filteredNodes.length === 0 && !isFiltering && !isLoadingSubgraph) {
    return (
      <div className={clsx('flex items-center justify-center h-96 text-gray-400', className)}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No agent data available</p>
          {enableFilters && Object.keys(filters).length > 0 && (
            <p className="text-sm mt-2">Try adjusting your filters</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('w-full h-full flex flex-col', className)}>
      {/* Controls Bar */}
      <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          {enableFilters && (
            <MapFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableAgents={agentNodes.map(n => n.name)}
            />
          )}
          {isFiltering && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <LoadingSpinner />
              <span>Filtering...</span>
            </div>
          )}
        </div>
        {enableFocusMode && focusNodeId && (
          <FocusModeControls
            focusNodeId={focusNodeId}
            depth={focusDepth}
            onDepthChange={handleDepthChange}
            onShowFullGraph={handleShowFullGraph}
            breadcrumb={breadcrumb}
          />
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {(isLoadingSubgraph || isFiltering) && (
          <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10">
            <LoadingSpinner />
          </div>
        )}
        <ReactFlow
          nodes={reactFlowNodes}
          edges={reactFlowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClickHandler}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          onInit={(instance) => {
            reactFlowInstance.current = instance;
          }}
          onError={(error) => {
            if (process.env.NODE_ENV === 'development') {
              console.error('ReactFlow error:', error);
            } else {
              import('@sentry/nextjs').then((Sentry) => {
                Sentry.captureException(error as unknown as Error);
              });
            }
            setMapRenderError(true);
          }}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as AgentNode;
              if (data.is_bottleneck) return '#dc2626'; // Red for bottlenecks
              if (data.metrics.score >= 4.0) return '#10b981'; // Green
              if (data.metrics.score >= 3.0) return '#f59e0b'; // Yellow
              return '#ef4444'; // Red
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>

      {/* Node Details Modal */}
      <Modal
        isOpen={showNodeDetails}
        onClose={() => {
          setShowNodeDetails(false);
          setSelectedNodeData(null);
        }}
        size="md"
      >
        {selectedNodeData && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">{selectedNodeData.name}</h3>
              <button
                onClick={() => {
                  setShowNodeDetails(false);
                  setSelectedNodeData(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-400 mb-2">Metrics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-500">Score</span>
                    <p className="text-lg font-semibold text-white">
                      {selectedNodeData.metrics.score.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Latency</span>
                    <p className="text-lg font-semibold text-white">
                      {selectedNodeData.metrics.latency.toFixed(0)}ms
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Call Count</span>
                    <p className="text-lg font-semibold text-white">
                      {selectedNodeData.metrics.call_count}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Success Rate</span>
                    <p className="text-lg font-semibold text-white">
                      {(selectedNodeData.metrics.success_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {selectedNodeData.provider && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Provider</h4>
                  <p className="text-white">{selectedNodeData.provider}</p>
                  {selectedNodeData.model && (
                    <p className="text-sm text-gray-400">{selectedNodeData.model}</p>
                  )}
                </div>
              )}

              {selectedNodeData.is_bottleneck && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-medium text-red-400">Bottleneck Detected</span>
                  </div>
                  {selectedNodeData.bottleneck_severity && (
                    <p className="text-xs text-gray-400 mt-1">
                      Severity: {selectedNodeData.bottleneck_severity}/10
                    </p>
                  )}
                </div>
              )}

              {selectedNodeData.latency_stats && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Latency Statistics</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Avg:</span>
                      <span className="text-white ml-2">{selectedNodeData.latency_stats.avg.toFixed(0)}ms</span>
                    </div>
                    <div>
                      <span className="text-gray-500">P95:</span>
                      <span className="text-white ml-2">{selectedNodeData.latency_stats.p95.toFixed(0)}ms</span>
                    </div>
                    <div>
                      <span className="text-gray-500">P99:</span>
                      <span className="text-white ml-2">{selectedNodeData.latency_stats.p99.toFixed(0)}ms</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedNodeData.dependencies && selectedNodeData.dependencies.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Dependencies</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedNodeData.dependencies.map((dep) => (
                      <span
                        key={dep}
                        className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
