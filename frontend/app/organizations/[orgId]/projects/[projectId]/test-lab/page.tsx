'use client';

import React, { useCallback, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  addEdge,
  useEdgesState,
  useNodesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import Button from '@/components/ui/Button';
import { projectsAPI, organizationsAPI } from '@/lib/api';
import { Bot, Play, Beaker, BarChart2 } from 'lucide-react'; // Added icons
import { TestLabBoxNode, type TestLabBoxNodeData } from '@/components/test-lab/TestLabBoxNode';
import InputNode, { type InputNodeData } from '@/components/test-lab/InputNode'; // Import InputNode
import OutputNode, { type OutputNodeData } from '@/components/test-lab/OutputNode'; // Import OutputNode
import BoxEditModal, { type BoxData } from '@/components/test-lab/BoxEditModal';
import DatasetEditorModal from '@/components/test-lab/DatasetEditorModal';
import { VariableDefinition, TestCase } from '@/components/test-lab/InputNode';
import { ContentBlock } from '@/types/test-lab/content-blocks'; // Import ContentBlock types
import RenameModal from '@/components/shared/RenameModal';
import LangChainImportModal from '@/components/test-lab/LangChainImportModal';
import DrawIOEdge from '@/components/shared/DrawIOEdge';
import DrawIOStepEdge from '@/components/shared/DrawIOStepEdge';
import RailwaySidePanel from '@/components/shared/RailwaySidePanel';
import AgentLogicInspector from '@/components/test-lab/AgentLogicInspector';
import RunConfigModal, { type RunConfig } from '@/components/test-lab/RunConfigModal';
import { ChainExecutor } from '@/lib/services/chain-executor'; // Import ChainExecutor



const TEST_LAB_BACKEND_ENABLED = true;

const nodeTypes = {
  testLabBox: TestLabBoxNode,
  inputNode: InputNode,
  outputNode: OutputNode,
};

const edgeTypes = {
  bezier: DrawIOEdge,
  step: DrawIOStepEdge,
};

export default function TestLabPage() {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const { data: project } = useSWR(
    projectId ? ['project', projectId] : null,
    () => projectsAPI.get(projectId),
  );
  const { data: org } = useSWR(
    orgId ? ['organization', orgId] : null,
    () => organizationsAPI.get(orgId, { includeStats: false }),
  );

  // React Flow canvas state
  // Use a union type for potential node data if needed, or stick to generic base
  const [nodes, setNodes, onNodesChange] = useNodesState<TestLabBoxNodeData | InputNodeData | OutputNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingBox, setEditingBox] = useState<BoxData | null>(null);
  // State for Editing Input Node
  const [editingInputNodeId, setEditingInputNodeId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'details' | 'inputs' | 'results' | 'settings'>('details');
  const [edgeStyle, setEdgeStyle] = useState<'bezier' | 'step'>('step'); // Default to step/smoothstep for Railway style
  const [isLangChainModalOpen, setIsLangChainModalOpen] = useState(false);

  // --- Undo/Redo Logic ---
  const [past, setPast] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);

  const takeSnapshot = useCallback(() => {
    setPast((prev) => [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }].slice(-50));
    setFuture([]);
  }, [nodes, edges]);

  const onUndo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPastArr = past.slice(0, past.length - 1);

    setFuture((prev) => [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }, ...prev].slice(0, 50));
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setPast(newPastArr);
  }, [past, nodes, edges, setNodes, setEdges]);

  const onRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);

    setPast((prev) => [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }].slice(-50));
    setNodes(next.nodes);
    setEdges(next.edges);
    setFuture(newFuture);
  }, [future, nodes, edges, setNodes, setEdges]);

  const [editingEdge, setEditingEdge] = useState<{ id: string; x: number; y: number; order: number } | null>(null);

  // Cycle Detection Logic (DFS)
  React.useEffect(() => {
    // 1. Build adjacency list
    const adj: Record<string, string[]> = {};
    nodes.forEach(n => adj[n.id] = []);
    edges.forEach(e => adj[e.source]?.push(e.target));

    // 2. DFS to find back-edges
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cyclicEdges = new Set<string>();

    const dfs = (u: string) => {
      visited.add(u);
      recStack.add(u);

      adj[u]?.forEach(v => {
        if (!visited.has(v)) {
          dfs(v);
        } else if (recStack.has(v)) {
          // Found a cycle: u -> v is a back-edge
          const edgeId = edges.find(e => e.source === u && e.target === v)?.id;
          if (edgeId) cyclicEdges.add(edgeId);
        }
      });

      recStack.delete(u);
    };

    nodes.forEach(n => {
      if (visited.has(n.id)) return;
      dfs(n.id);
    });

    // 3. Update edges if cycle status changed
    setEdges(eds => {
      let changed = false;
      const newEdges = eds.map(e => {
        const isCyclic = cyclicEdges.has(e.id);
        if (e.data?.isCyclic !== isCyclic) {
          changed = true;
          return { ...e, data: { ...e.data, isCyclic } };
        }
        return e;
      });
      return changed ? newEdges : eds;
    });
  }, [nodes.length, edges.length, edges, nodes, setEdges]); // Dep check optimized

  const [renamingBox, setRenamingBox] = useState<{ id: string; label: string } | null>(null);
  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [runScope, setRunScope] = useState<'global' | 'chain' | 'node'>('global');
  const [runTargetId, setRunTargetId] = useState<string | undefined>(undefined);

  const handleRunExperiment = async (config: RunConfig) => {
    setIsRunConfigOpen(false);
    console.log('Starting Experiment with Config:', config);
    setDetailTab('results'); // Switch to results tab to show progress

    // Reset all nodes to idle
    setNodes((prev) => prev.map(n => ({ ...n, data: { ...n.data, status: 'idle' } })));

    // Execute Chain
    try {
      const executor = new ChainExecutor(nodes, edges, (nodeId, status) => {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id === nodeId) {
              return { ...n, data: { ...n.data, status } };
            }
            return n;
          })
        );
      });

      const sortedNodes = executor.getExecutionOrder();
      console.log('Execution Order:', sortedNodes.map(n => n.data.label));

      let currentInputs: any[] = [];

      for (const node of sortedNodes) {
        currentInputs = await executor.executeStep(node.id, currentInputs);
      }
      console.log('Chain Execution Complete', executor.getLogs());

    } catch (e) {
      console.error('Execution Failed:', e);
      // Mark current running nodes as error
      setNodes((prev) => prev.map(n => {
        if (n.data.status === 'running') {
          return { ...n, data: { ...n.data, status: 'error' } };
        }
        return n;
      }));
      alert('Chain execution failed: ' + e);
    }
  };

  const onRunAgent = (id: string) => {
    setRunScope('node');
    setRunTargetId(id);
    setIsRunConfigOpen(true);
  };

  const onRunChain = (id: string) => {
    setRunScope('chain');
    setRunTargetId(id);
    setIsRunConfigOpen(true);
  };




  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        // Ghost numbering: Find max order from source and default to next
        const outgoingEdges = eds.filter(e => e.source === connection.source);
        const maxOrder = outgoingEdges.reduce((max, e) => Math.max(max, e.data?.order || 0), 0);
        const nextOrder = maxOrder === 0 ? 1 : maxOrder + 1;

        return addEdge(
          {
            ...connection,
            type: edgeStyle,
            data: { order: nextOrder },
            style: {
              strokeWidth: 2,
              stroke: '#8b5cf6',
            },
          },
          eds,
        );
      });
    },
    [setEdges, edgeStyle],
  );


  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setDetailTab('details');
    },
    [],
  );

  const handleEditBox = useCallback((id: string) => {
    setNodes((nds) => {
      const node = nds.find((n) => n.id === id);
      if (node && node.type === 'testLabBox') {
        const boxData = node.data as TestLabBoxNodeData;
        setEditingBox({
          id: node.id,
          label: boxData.label,
          model: boxData.model,
          systemPrompt: boxData.systemPrompt,
          inputs: [],
        });
      }
      return nds;
    });
  }, [setNodes]);

  const handleRenameBox = useCallback((id: string, newLabel: string) => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              label: newLabel,
            },
          };
        }
        return node;
      })
    );
  }, [setNodes, takeSnapshot]);

  const handleUpdateEdge = useCallback((id: string, data: any) => {
    takeSnapshot();
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id === id) {
          return { ...e, data };
        }
        return e;
      })
    );
  }, [setEdges, takeSnapshot]);

  const handleDeleteEdge = useCallback((id: string) => {
    takeSnapshot();
    setEdges((eds) => eds.filter((e) => e.id !== id));
  }, [setEdges, takeSnapshot]);

  const selectedBoxNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const selectedBox = useMemo(() => {
    if (!selectedBoxNode) return null;
    // Allow testLabBox, outputNode, and inputNode to open the panel
    if (['testLabBox', 'outputNode', 'inputNode'].includes(selectedBoxNode.type || '')) {
      return selectedBoxNode.data as any;
    }
    return null;
  }, [selectedBoxNode]);

  const handleDeleteBox = useCallback((id: string) => {

    takeSnapshot();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }, [setNodes, setEdges, selectedNodeId, takeSnapshot]);

  const handleAddBox = () => {
    const newId = `box-${Date.now()}`;
    const newNodes: Node<TestLabBoxNodeData>[] = [
      ...nodes as Node<TestLabBoxNodeData>[],
      {
        id: newId,
        type: 'testLabBox',
        data: {
          label: `Agent ${nodes.filter(n => n.type === 'testLabBox').length + 1}`,
          model: 'gpt-4o',
          inputCount: 0,
          onEdit: () => setRenamingBox({ id: newId, label: `Agent ${nodes.filter(n => n.type === 'testLabBox').length + 1}` }),
          onDelete: () => handleDeleteBox(newId),
          status: 'idle',
        },
        position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      },
    ];
    setNodes(newNodes);
  };

  const handleAddInputBox = () => {
    const newId = `inputs-${Date.now()}`;
    const newNode: Node<InputNodeData> = {
      id: newId,
      type: 'inputNode',
      data: {
        label: 'User Inputs',
        inputs: [],
        onEdit: () => setEditingInputNodeId(newId),
        onDelete: () => handleDeleteBox(newId),
        status: 'idle',
      },
      position: { x: 100, y: 300 },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleUpdateInputNode = (variables: VariableDefinition[], testCases: TestCase[]) => {
    if (!editingInputNodeId) return;

    takeSnapshot();
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id === editingInputNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              variables,
              testCases,
              label: testCases.length > 0 ? `${testCases.length} Test Cases` : 'Empty Dataset',
              // Clear legacy inputs to avoid confusion? Or keep them?
              // inputs: [], 
            }
          };
        }
        return node;
      })
    );
    setEditingInputNodeId(null);
  };

  // Helper to get current inputs for the editing node
  const currentEditingData = useMemo(() => {
    if (!editingInputNodeId) return { variables: [], testCases: [] };
    const node = nodes.find(n => n.id === editingInputNodeId);
    if (node && node.type === 'inputNode') {
      const data = node.data as InputNodeData;
      return {
        variables: data.variables || [],
        testCases: data.testCases || [],
      };
    }
    return { variables: [], testCases: [] };
  }, [nodes, editingInputNodeId]);

  const handleAddOutputBox = () => {
    const newId = `eval-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id: newId,
        type: 'outputNode',
        data: {
          label: 'Evaluator',
          onDelete: () => handleDeleteBox(newId),
          status: 'idle',
        },
        position: { x: 800, y: 300 },
      }
    ]);
  };

  const handleSaveBox = useCallback(
    (box: BoxData) => {
      takeSnapshot();
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id === box.id && node.type === 'testLabBox') {
            return {
              ...node,
              data: {
                ...node.data,
                label: box.label,
                model: box.model,
                systemPrompt: box.systemPrompt,
                inputCount: box.inputs?.length || 0,
                onEdit: () => setRenamingBox({ id: box.id, label: box.label }),
                onDelete: () => handleDeleteBox(box.id),
              },
            };
          }
          return node;
        }),
      );
    },
    [setNodes, handleEditBox, handleDeleteBox, takeSnapshot],
  );

  const handleRunTest = () => {
    // TODO: 백엔드 연동 후 테스트 실행
    console.log('Test run not yet implemented', { nodes, edges });
  };

  const handleLangChainImport = (importedBoxes: any[], importedConnections: any[]) => {
    // Convert imported boxes to React Flow nodes
    const newNodes: Node<TestLabBoxNodeData>[] = importedBoxes.map((box, index) => {
      const nodeId = box.id || `box-${Date.now()}-${index}`;
      return {
        id: nodeId,
        type: 'testLabBox',
        data: {
          label: box.label || `Box ${index + 1}`,
          model: box.model || 'gpt-4o',
          systemPrompt: box.systemPrompt || '',
          inputCount: box.inputs?.length || 0,
          onEdit: () => setRenamingBox({ id: nodeId, label: box.label || `Box ${index + 1}` }),
          onDelete: () => {
            setNodes((prev) => prev.filter((n) => n.id !== nodeId));
            if (selectedNodeId === nodeId) setSelectedNodeId(null);
          },
        },
        position: { x: Math.random() * 400 + index * 300, y: Math.random() * 300 },
      };
    });

    // Convert imported connections to React Flow edges
    const newEdges: Edge[] = importedConnections.map((conn) => ({
      id: `edge-${conn.source}-${conn.target}`,
      source: conn.source,
      target: conn.target,
      type: edgeStyle,
      style: {
        strokeWidth: 2,
        stroke: '#8b5cf6',
      },
    }));

    // Add new nodes and edges to existing ones
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
  };

  const isValidConnection = (connection: Connection) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (!sourceNode || !targetNode) return false;

    // 1. Prevent self-loops
    if (connection.source === connection.target) return false;

    // 2. Prevent duplicate connections
    const isDuplicate = edges.some(
      (e) => e.source === connection.source && e.target === connection.target
    );
    if (isDuplicate) return false;

    // 3. Type-based Rules
    // Input Node can ONLY connect to TestLabBox or Output
    if (sourceNode.type === 'inputNode') {
      return targetNode.type === 'testLabBox' || targetNode.type === 'outputNode';
    }

    // Output Node cannot have outgoing connections
    if (sourceNode.type === 'outputNode') {
      return false;
    }

    // TestLabBox can connect to TestLabBox or Output
    if (sourceNode.type === 'testLabBox') {
      return targetNode.type === 'testLabBox' || targetNode.type === 'outputNode';
    }

    // Additional: Target cannot be InputNode (Input has no incoming handles usually, but good to enforce)
    if (targetNode.type === 'inputNode') {
      return false;
    }

    return true;
  };



  // Zoom handlers ref - will be set by ZoomControls component
  const zoomHandlersRef = React.useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    fitView: (options?: any) => void;
  } | null>(null);

  // ReactFlow zoom controls component - sets handlers once
  const ZoomControls = () => {
    const { zoomIn, zoomOut, fitView } = useReactFlow();
    React.useEffect(() => {
      // Store handlers in ref - useReactFlow functions are stable, so we only set once
      zoomHandlersRef.current = { zoomIn, zoomOut, fitView };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps: useReactFlow functions are stable references
    return null;
  };

  const onZoomIn = useCallback(() => {
    zoomHandlersRef.current?.zoomIn();
  }, []);
  const onZoomOut = useCallback(() => {
    zoomHandlersRef.current?.zoomOut();
  }, []);
  const onFitView = useCallback(() => {
    zoomHandlersRef.current?.fitView({ padding: 0.4 });
  }, []);


  const handleAutoLayout = useCallback(() => {
    takeSnapshot();

    // Custom Hierarchical Layout Algorithm (Left-to-Right)
    // 1. Build an adjacency list and calculate in-degrees
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    nodes.forEach(n => {
      adj[n.id] = [];
      inDegree[n.id] = 0;
    });

    edges.forEach(e => {
      if (adj[e.source]) adj[e.source].push(e.target);
      inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    });

    // 2. Assign ranks based on dependency depth using BFS
    const ranks: Record<string, number> = {};
    const queue: string[] = [];

    // Initial nodes (no incoming edges)
    nodes.forEach(n => {
      if ((inDegree[n.id] || 0) === 0) {
        ranks[n.id] = 0;
        queue.push(n.id);
      }
    });

    // Handle disconnected components/cycles by putting remaining nodes into queue slowly
    if (queue.length === 0 && nodes.length > 0) {
      ranks[nodes[0].id] = 0;
      queue.push(nodes[0].id);
    }

    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      const currentRank = ranks[u] ?? 0;

      adj[u]?.forEach(v => {
        const nextRank = currentRank + 1;
        if (ranks[v] === undefined || nextRank > ranks[v]) {
          ranks[v] = nextRank;
          if (!queue.includes(v)) queue.push(v);
        }
      });
    }

    // Nodes not reached by BFS (cycles or missed islands)
    nodes.forEach(n => {
      if (ranks[n.id] === undefined) ranks[n.id] = 0;
    });

    // 3. Position nodes based on ranks
    const rankCounts: Record<number, number> = {};
    const HORIZONTAL_GAP = 500; // Increased from 350 for better spacing
    const VERTICAL_GAP = 220;

    setNodes((nds) =>
      nds.map((node) => {
        const rank = ranks[node.id] || 0;
        const indexInRank = rankCounts[rank] || 0;
        rankCounts[rank] = indexInRank + 1;

        return {
          ...node,
          position: {
            x: rank * HORIZONTAL_GAP + 50,
            y: indexInRank * VERTICAL_GAP + 50
          },
        };
      })
    );

    // Wait for state update then fit view
    setTimeout(() => onFitView(), 50);
  }, [nodes, edges, setNodes, onFitView, takeSnapshot]);

  const handleResetCanvas = useCallback(() => {
    takeSnapshot();
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
  }, [setNodes, setEdges, takeSnapshot]);

  // Wrap node addition to take snapshot
  const handleAddBoxWithSnapshot = useCallback(() => {
    takeSnapshot();
    handleAddBox();
  }, [handleAddBox, takeSnapshot]);

  const handleConnectWithSnapshot = useCallback((params: Connection) => {
    takeSnapshot();
    handleConnect(params);
  }, [handleConnect, takeSnapshot]);

  return (
    <ReactFlowProvider>
      <ZoomControls />
      <CanvasPageLayout
        orgId={orgId}
        projectId={projectId}
        projectName={project?.name}
        orgName={org?.name}
        activeTab="test-lab"
        showCopyButton={false}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitView={onFitView}
        onUndo={onUndo}
        onRedo={onRedo}
        onAutoLayout={handleAutoLayout}
        onResetCanvas={handleResetCanvas}
      >


        <div className="flex-1 flex items-stretch min-h-0 relative">
          {/* Main canvas area - restored to 100% of the rounded shell */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0 rounded-t-[32px] overflow-hidden relative">

              {/* Floating Toolbar for Adding Nodes - Centered and Horizontal */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-[#1a1a1e]/80 backdrop-blur-md p-2 rounded-full border border-white/10 shadow-lg px-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddInputBox}
                  className="justify-start gap-2 hover:bg-emerald-500/10 hover:text-emerald-400 group"
                  title="Add Start Node"
                >
                  <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <Play className="w-3 h-3 fill-current" />
                  </div>
                  <span className="text-xs font-medium">Add Input</span>
                </Button>

                <div className="w-px h-6 bg-white/10" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddBoxWithSnapshot}
                  className="justify-start gap-2 hover:bg-violet-500/10 hover:text-violet-400 group"
                  title="Add Agent Node"
                >
                  <div className="p-1 rounded bg-violet-500/20 text-violet-400 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                    <Bot className="w-3 h-3" />
                  </div>
                  <span className="text-xs font-medium">Add Agent</span>
                </Button>

                <div className="w-px h-6 bg-white/10" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddOutputBox}
                  className="justify-start gap-2 hover:bg-blue-500/10 hover:text-blue-400 group"
                  title="Add Evaluation Node"
                >
                  <div className="p-1 rounded bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <BarChart2 className="w-3 h-3" />
                  </div>
                  <span className="text-xs font-medium">Add Eval</span>
                </Button>
              </div>

              {nodes.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-sm text-slate-400 bg-[#0d0d12]">
                  <div className="text-center animate-in fade-in zoom-in duration-500">
                    <p className="text-xl font-bold text-slate-300 tracking-tight">Ready for Building</p>
                    <p className="mt-2 text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                      Use the Sidebar or the floating toolbar to verify your Agent flow.
                    </p>
                  </div>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={handleConnectWithSnapshot}
                  isValidConnection={isValidConnection}
                  onNodeClick={onNodeClick}
                  onEdgeDoubleClick={(event, edge) => {
                    setEditingEdge({
                      id: edge.id,
                      x: event.clientX,
                      y: event.clientY,
                      order: edge.data?.order || 1,
                    });
                  }}
                  onNodeDragStart={takeSnapshot}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  snapToGrid={true}
                  snapGrid={[30, 30]}
                  fitView
                  fitViewOptions={{ padding: 0.3, maxZoom: 0.9 }}
                  proOptions={{ hideAttribution: true }}
                  className="bg-[#0d0d12]"
                  defaultEdgeOptions={{
                    type: edgeStyle,
                    markerEnd: {
                      type: MarkerType.ArrowClosed,
                      color: '#8b5cf6',
                    },
                    style: {
                      strokeWidth: 2,
                      stroke: '#8b5cf6',
                    },
                  }}
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={36}
                    size={1.8}
                    color="rgba(148, 163, 184, 0.35)"
                  />
                </ReactFlow>
              )}
            </div>
          </div>

          {/* Edge Order Popover */}
          {editingEdge && (
            <div
              className="fixed z-[100] bg-[#1a1a1e] border border-violet-500/50 rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in duration-200"
              style={{
                left: Math.min(window.innerWidth - 180, editingEdge.x - 90),
                top: Math.min(window.innerHeight - 80, editingEdge.y - 60)
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Step Order</span>
                <input
                  autoFocus
                  type="number"
                  className="w-12 h-8 bg-violet-600/20 border border-violet-500/40 rounded-lg text-center text-sm text-white font-bold focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 transition-all"
                  value={editingEdge.order}
                  onChange={(e) => setEditingEdge({ ...editingEdge, order: parseInt(e.target.value) || 1 })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateEdge(editingEdge.id, { order: editingEdge.order });
                      setEditingEdge(null);
                    }
                    if (e.key === 'Escape') setEditingEdge(null);
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    handleUpdateEdge(editingEdge.id, { order: editingEdge.order });
                    setEditingEdge(null);
                  }}
                  className="h-8 py-0 px-3"
                >
                  Save
                </Button>
              </div>
              <div className="mt-2 text-[9px] text-slate-600 text-center flex items-center justify-center gap-2">
                <span>Enter to Save</span>
                <span className="w-1 h-1 bg-slate-700 rounded-full" />
                <span>Esc to Cancel</span>
              </div>
            </div>
          )}


          {/* Railway-style right panel */}
          <RailwaySidePanel
            title={selectedBox?.label || 'No box selected'}
            isOpen={!!selectedBox}
            onClose={() => setSelectedNodeId(null)}
            tabs={[
              { id: 'details', label: 'Details' },
              { id: 'results', label: 'Results' },
            ]}
            activeTab={detailTab}
            onTabChange={(tabId) => setDetailTab(tabId as typeof detailTab)}
          >
            {selectedBoxNode && (
              <AgentLogicInspector
                selectedNode={selectedBoxNode}
                nodes={nodes}
                edges={edges}
                onUpdateNode={(id, data) => {
                  takeSnapshot();
                  setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
                }}
                onUpdateEdge={handleUpdateEdge}
                onDeleteEdge={handleDeleteEdge}
                activeTab={detailTab}
                onRunAgent={onRunAgent}
                onRunChain={onRunChain}
              />
            )}

            {/* Settings Tab Override (optional extra actions) */}
            {selectedBoxNode && detailTab === 'settings' && (
              <div className="px-5 py-4 space-y-4 text-sm">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingBox(selectedBox)}
                  className="w-full"
                >
                  Edit Box Properties
                </Button>
                <div className="pt-4 border-t border-white/10">
                  <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Box ID</div>
                  <div className="text-xs text-slate-400 font-mono bg-black/40 p-2 rounded border border-white/10">
                    {selectedBoxNode.id}
                  </div>
                </div>
              </div>
            )}
          </RailwaySidePanel>

        </div>

        {/* Rename Modal */}
        <RenameModal
          isOpen={!!renamingBox}
          onClose={() => setRenamingBox(null)}
          initialValue={renamingBox?.label || ''}
          onSave={(newName) => {
            if (renamingBox) handleRenameBox(renamingBox.id, newName);
          }}
        />

        {/* Run Config Modal */}
        <RunConfigModal
          isOpen={isRunConfigOpen}
          onClose={() => setIsRunConfigOpen(false)}
          onRun={handleRunExperiment}
          initialScope={runScope}
          targetId={runTargetId}
        />

        {/* Box Edit Modal */}
        <BoxEditModal
          isOpen={!!editingBox}
          onClose={() => setEditingBox(null)}
          box={editingBox}
          onSave={handleSaveBox}
        />

        {/* Dataset Editor Modal (Replaces ManualInputModal) */}
        {editingInputNodeId && (
          <DatasetEditorModal
            isOpen={true}
            onClose={() => setEditingInputNodeId(null)}
            onSave={handleUpdateInputNode}
            initialVariables={currentEditingData.variables}
            initialTestCases={currentEditingData.testCases}
          />
        )}

        {/* LangChain Import Modal */}
        <LangChainImportModal
          isOpen={isLangChainModalOpen}
          onClose={() => setIsLangChainModalOpen(false)}
          onImport={handleLangChainImport}
          projectId={projectId}
        />
      </CanvasPageLayout>
    </ReactFlowProvider >
  );
}
