'use client';

import { useState, useEffect } from 'react';
import { GitBranch, Map, ArrowRight, Layers } from 'lucide-react';
import { dependencyAnalysisAPI, mappingAPI } from '@/lib/api';
import AgentMap from '@/components/mapping/AgentMap';
import { UpgradePrompt } from '@/components/subscription/UpgradePrompt';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import { clsx } from 'clsx';

interface DependencyNode {
  id: string;
  name: string;
  dependencies?: string[];
  dependents?: string[];
  depth?: number;
}

interface DependencyAnalysisProps {
  projectId: number;
  onClose?: () => void;
}

export default function DependencyAnalysis({ projectId, onClose }: DependencyAnalysisProps) {
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
        const data = await dependencyAnalysisAPI.analyzeDependencies(projectId);
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
          setError(err.message || 'Failed to analyze dependencies');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [projectId]);

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
          feature="Dependency Analysis"
          requiredPlan="Pro"
          message="Full dependency analysis with mapping visualization requires Pro plan or higher."
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

  const metadata = analysis.metadata || {};
  const dependencyMap = analysis.dependency_map || {};
  const dependentsMap = analysis.dependents_map || {};
  const nodeDepths = analysis.node_depths || {};
  const rootNodes = analysis.root_nodes || [];
  const leafNodes = analysis.leaf_nodes || [];
  const dependencyGraph = analysis.dependency_graph || {};
  const allNodes = dependencyGraph.nodes || [];

  // Build dependency chains for display
  const buildDependencyChains = () => {
    const chains: string[][] = [];
    const visited = new Set<string>();

    // Start from root nodes
    for (const rootId of rootNodes) {
      const chain: string[] = [];
      let currentId: string | undefined = rootId;
      
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        chain.push(currentId);
        
        // Find next node in chain (has dependents)
        const dependents = dependentsMap[currentId] || [];
        currentId = dependents.length > 0 ? dependents[0] : undefined;
      }
      
      if (chain.length > 0) {
        chains.push(chain);
      }
    }

    return chains;
  };

  const dependencyChains = buildDependencyChains();

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Dependency Analysis</h2>
          {analysis.mapping_available && (
            <button
              onClick={() => setShowMap(!showMap)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Map className="w-4 h-4" />
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Total Nodes</div>
            <div className="text-2xl font-bold text-white">{metadata.total_nodes || 0}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Dependencies</div>
            <div className="text-2xl font-bold text-blue-500">{metadata.total_edges || 0}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Root Nodes</div>
            <div className="text-2xl font-bold text-green-500">{rootNodes.length}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Leaf Nodes</div>
            <div className="text-2xl font-bold text-purple-500">{leafNodes.length}</div>
          </div>
        </div>

        {/* Dependency Chains */}
        {dependencyChains.length > 0 && (
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              Dependency Chains
            </h3>
            {dependencyChains.map((chain, chainIdx) => (
              <div
                key={chainIdx}
                className="p-4 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {chain.map((nodeId, idx) => {
                    const node = allNodes.find((n: any) => n.id === nodeId);
                    const nodeName = node?.name || nodeId;
                    const depth = nodeDepths[nodeId] || 0;
                    return (
                      <div key={nodeId} className="flex items-center gap-2">
                        <div className="px-3 py-1.5 bg-slate-800 rounded-md border border-slate-700">
                          <span className="text-sm font-medium text-white">{nodeName}</span>
                          {depth > 0 && (
                            <span className="ml-2 text-xs text-slate-400">(depth: {depth})</span>
                          )}
                        </div>
                        {idx < chain.length - 1 && (
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Node Details */}
        {allNodes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Node Dependencies
            </h3>
            {allNodes.map((node: any) => {
              const nodeId = node.id;
              const dependencies = dependencyMap[nodeId] || [];
              const dependents = dependentsMap[nodeId] || [];
              const depth = nodeDepths[nodeId] || 0;
              
              return (
                <div
                  key={nodeId}
                  className="p-4 bg-slate-900 rounded-lg border border-slate-700"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-white text-lg">{node.name || nodeId}</h4>
                      {depth > 0 && (
                        <span className="text-xs text-slate-400 mt-1 block">Dependency Depth: {depth}</span>
                      )}
                    </div>
                    <div className="flex gap-2 text-xs">
                      {rootNodes.includes(nodeId) && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">Root</span>
                      )}
                      {leafNodes.includes(nodeId) && (
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">Leaf</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <div className="text-sm text-slate-400 mb-2">Depends On</div>
                      {dependencies.length > 0 ? (
                        <div className="space-y-1">
                          {dependencies.map((depId: string) => {
                            const depNode = allNodes.find((n: any) => n.id === depId);
                            return (
                              <div
                                key={depId}
                                className="text-sm text-blue-400 px-2 py-1 bg-blue-500/10 rounded"
                              >
                                {depNode?.name || depId}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500 italic">No dependencies</div>
                      )}
                    </div>
                    
                    <div>
                      <div className="text-sm text-slate-400 mb-2">Dependents</div>
                      {dependents.length > 0 ? (
                        <div className="space-y-1">
                          {dependents.map((depId: string) => {
                            const depNode = allNodes.find((n: any) => n.id === depId);
                            return (
                              <div
                                key={depId}
                                className="text-sm text-purple-400 px-2 py-1 bg-purple-500/10 rounded"
                              >
                                {depNode?.name || depId}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500 italic">No dependents</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {allNodes.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-lg font-medium">No dependencies found!</p>
            <p className="text-sm mt-1">Agents appear to be independent.</p>
          </div>
        )}
      </div>

      {/* Map Visualization (Pro only) */}
      {showMap && analysis.mapping_available && mappingData && (
        <div className="h-[600px] bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <AgentMap
            projectId={projectId}
            nodes={(mappingData.nodes || []).map((node: any) => ({
              ...node,
              dependencies: dependencyMap[node.id] || [],
              dependents: dependentsMap[node.id] || [],
              depth: nodeDepths[node.id],
            }))}
            edges={mappingData.edges || []}
            enableFilters={true}
            enableFocusMode={true}
          />
        </div>
      )}

      {!analysis.mapping_available && (
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <UpgradePrompt
            feature="Dependency Analysis Map"
            requiredPlan="Pro"
            message="Visualize dependency relationships on the agent map with Pro plan."
          />
        </div>
      )}
    </div>
  );
}
