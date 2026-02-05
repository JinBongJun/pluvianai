'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { testLabAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Plus, Play, Beaker, ArrowRight, Link2, UploadCloud } from 'lucide-react';
import clsx from 'clsx';

type Canvas = {
  id: string;
  project_id: number;
  name: string;
  boxes: any[];
  connections: any[];
};

type TestResultItem = {
  id: string;
  agent_id?: string | null;
  input?: string | null;
  response?: string | null;
  step_order?: number | null;
  signal_result?: {
    status?: string;
    is_worst?: boolean;
    [key: string]: unknown;
  } | null;
  is_worst?: boolean | null;
  worst_status?: string | null;
};

type ResultFilter = 'all' | 'needs_review' | 'critical' | 'worst';

const PROVIDER_OPTIONS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'custom', label: 'Custom' },
] as const;

const MODEL_OPTIONS: Record<string, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'gpt-4', label: 'GPT-4' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { id: 'o1-preview', label: 'o1 (Preview)' },
    { id: 'o1-mini', label: 'o1 Mini' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus', label: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku', label: 'Claude 3 Haiku' },
  ],
  google: [
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro' },
    { id: 'gemini-pro', label: 'Gemini Pro' },
  ],
  custom: [],
};

export default function TestLabPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();

  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(
    Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId,
  );

  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [runInputs, setRunInputs] = useState<string>('');
  const [results, setResults] = useState<TestResultItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConcurrencyBlocked, setIsConcurrencyBlocked] = useState(false);
  const [concurrencyError, setConcurrencyError] = useState<{
    message?: string;
    limit?: number;
    current?: number;
  } | null>(null);
  const [limitError, setLimitError] = useState<{
    code?: string;
    message?: string;
    limit?: number;
    requested?: number;
  } | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

  // React Flow canvas state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [arrowMode, setArrowMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // CSV import modal state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvInputColumn, setCsvInputColumn] = useState<string>('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<Record<string, string | null>[]>([]);
  const [csvImportedCount, setCsvImportedCount] = useState<number | null>(null);
  const [csvSkippedCount, setCsvSkippedCount] = useState<number | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);

  const { data: canvasesData, mutate: refreshCanvases } = useSWR(
    projectId ? ['test-lab-canvases', projectId] : null,
    () => testLabAPI.listCanvases(projectId),
  );

  const canvases: Canvas[] = useMemo(() => canvasesData?.items || [], [canvasesData]);

  // Derive React Flow nodes/edges from boxes/connections
  useEffect(() => {
    const nextNodes: Node[] = (boxes || []).map((box, idx) => ({
      id: String(box.id ?? `box-${idx + 1}`),
      data: {
        label:
          (box.label || `Box ${idx + 1}`) +
          (Array.isArray(box.inputs) && box.inputs.length
            ? ` (📊 ${box.inputs.length})`
            : ''),
      },
      position: box.position || { x: 120 * (idx % 4), y: 80 * Math.floor(idx / 4) },
    }));

    const nextEdges: Edge[] = (connections || []).map((conn, idx) => ({
      id: conn.id || `e-${conn.source}-${conn.target}-${idx}`,
      source: String(conn.source ?? conn.from ?? ''),
      target: String(conn.target ?? conn.to ?? ''),
    }));

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [boxes, connections, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      // Persist positions back into boxes so we can save via canvas PUT
      setBoxes((prev) => {
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        const next = prev.map((box) => {
          const id = String(box.id);
          const node = nodeMap.get(id);
          if (!node) return box;
          return {
            ...box,
            position: node.position,
          };
        });
        return next;
      });
    },
    [nodes, onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!arrowMode) return;
      setEdges((eds) => addEdge(connection, eds));
      const { source, target } = connection;
      if (!source || !target) return;

      setConnections((prev) => {
        const exists = prev.some(
          (e) =>
            String(e.source ?? e.from) === String(source) &&
            String(e.target ?? e.to) === String(target),
        );
        if (exists) return prev;
        return [
          ...prev,
          {
            id: `conn-${source}-${target}-${prev.length + 1}`,
            source,
            target,
          },
        ];
      });
    },
    [arrowMode, setEdges],
  );

  useEffect(() => {
    if (!projectId || !orgId) return;

    const init = async () => {
      if (!canvases.length) {
        // Lazily create a default canvas
        try {
          const created = await testLabAPI.createCanvas(projectId, {
            name: 'Default Canvas',
            boxes: [],
            connections: [],
          });
          setActiveCanvasId(created.id);
          setBoxes(created.boxes || []);
          setConnections(created.connections || []);
          await refreshCanvases();
        } catch (err) {
          toast.showToast('Failed to create Test Lab canvas', 'error');
        }
      } else if (!activeCanvasId) {
        const first = canvases[0];
        setActiveCanvasId(first.id);
        setBoxes(first.boxes || []);
        setConnections(first.connections || []);
      }
    };

    void init();
  }, [projectId, orgId, canvases, activeCanvasId, refreshCanvases, toast]);

  const handleSelectCanvas = (canvas: Canvas) => {
    setActiveCanvasId(canvas.id);
    setBoxes(canvas.boxes || []);
    setConnections(canvas.connections || []);
    setResults([]);
    setSelectedNodeId(null);
  };

  const handleAddBox = async () => {
    if (!activeCanvasId) return;
    if (boxes.length >= 30) {
      toast.showToast('Test Lab 캔버스는 최대 30개 박스까지만 허용됩니다.', 'warning');
      return;
    }
    const newBoxId = `box-${boxes.length + 1}`;
    const newBoxes = [
      ...boxes,
      {
        id: newBoxId,
        label: `Box ${boxes.length + 1}`,
        model: '',
        system_prompt: '',
        inputs: [],
      },
    ];
    setBoxes(newBoxes);
    try {
      await testLabAPI.updateCanvas(projectId, activeCanvasId, {
        boxes: newBoxes,
        connections,
      });
      await refreshCanvases();
    } catch {
      toast.showToast('Failed to save canvas', 'error');
    }
  };

  const handleBoxFieldChange = (boxId: string, field: string, value: string) => {
    const updated = boxes.map((b) => (String(b.id) === String(boxId) ? { ...b, [field]: value } : b));
    setBoxes(updated);
  };

  const handleBoxInputsChange = (boxId: string, value: string) => {
    const lines = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const updated = boxes.map((b) =>
      String(b.id) === String(boxId) ? { ...b, inputs: lines } : b,
    );
    setBoxes(updated);
  };

  const handleSaveCanvas = async () => {
    if (!activeCanvasId) return;
    try {
      await testLabAPI.updateCanvas(projectId, activeCanvasId, {
        boxes,
        connections,
      });
      await refreshCanvases();
      toast.showToast('Canvas saved', 'success');
    } catch {
      toast.showToast('Failed to save canvas', 'error');
    }
  };

  const handleRunTest = async () => {
    if (!activeCanvasId || isConcurrencyBlocked) return;
    const selectedBoxForRun = selectedNodeId
      ? boxes.find((b) => String(b.id) === String(selectedNodeId))
      : null;

    const boxInputs: string[] =
      selectedBoxForRun && Array.isArray(selectedBoxForRun.inputs)
        ? (selectedBoxForRun.inputs as string[])
        : [];

    const inputs =
      boxInputs.length > 0
        ? boxInputs
        : runInputs
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

    setIsRunning(true);
    setResults([]);
    setLimitError(null);

    try {
      const run = await testLabAPI.runTest(projectId, {
        name: 'Test Lab Run',
        test_type: 'chain',
        canvas_id: activeCanvasId,
        input_prompts: inputs,
        // If a box is selected, run only that box; otherwise run full chain
        box_ids: selectedNodeId ? [String(selectedNodeId)] : undefined,
      });

      // Fetch results for this run
      const resultPayload = await testLabAPI.listResults(projectId, {
        run_id: run.id,
        limit: 500,
        offset: 0,
      });
      setResults((resultPayload.items || []) as TestResultItem[]);
      toast.showToast('Test Lab run completed with live LLM calls', 'success');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const errorCode = typeof detail === 'object' ? detail?.code : undefined;
      if (err?.response?.status === 403 && errorCode === 'CONCURRENT_TEST_NOT_ALLOWED') {
        setIsConcurrencyBlocked(true);
        setConcurrencyError({
          message:
            detail?.message ||
            '동시에 실행할 수 있는 테스트 개수를 초과했습니다. 다른 테스트가 완료된 후 다시 시도해주세요.',
          limit: detail?.limit,
          current: detail?.current,
        });
        toast.showToast(
          detail?.message ||
            '다른 테스트가 이미 실행 중입니다. 먼저 실행 중인 테스트가 끝난 후 다시 시도해주세요.',
          'warning',
        );
      } else if (
        err?.response?.status === 403 &&
        (errorCode === 'LIMIT_INPUTS_PER_TEST' || errorCode === 'LIMIT_TOTAL_CALLS_PER_TEST')
      ) {
        setLimitError({
          code: errorCode,
          message:
            (typeof detail === 'object' ? detail?.message : detail) ||
            '현재 플랜에서 허용된 테스트 한도를 초과했습니다. 입력 수를 줄이거나 플랜을 업그레이드해주세요.',
          limit: detail?.limit,
          requested: detail?.requested,
        });
        toast.showToast(
          (typeof detail === 'object' ? detail?.message : detail) ||
            '현재 플랜에서 허용된 테스트 한도를 초과했습니다.',
          'warning',
        );
      } else {
        const message =
          (typeof detail === 'object' ? detail?.message : detail) ||
          'Failed to run Test Lab test';
        toast.showToast(message, 'error');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!results.length) return [];
    return results.filter((res) => {
      const status = res.signal_result?.status;
      const isWorst = res.is_worst || res.signal_result?.is_worst;
      if (resultFilter === 'all') return true;
      if (resultFilter === 'needs_review') return status === 'needs_review';
      if (resultFilter === 'critical') return status === 'critical';
      if (resultFilter === 'worst') return !!isWorst;
      return true;
    });
  }, [results, resultFilter]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, TestResultItem[]> = {};
    filteredResults.forEach((res) => {
      const key = `${res.agent_id || 'unknown'}::${res.input || ''}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(res);
    });
    return groups;
  }, [filteredResults]);

  const selectedBox = useMemo(
    () => boxes.find((b) => String(b.id) === String(selectedNodeId)),
    [boxes, selectedNodeId],
  );

  const estimatedCalls = useMemo(() => {
    const boxCount = selectedNodeId ? 1 : boxes.length || 0;
    const globalInputCount =
      runInputs
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean).length || 1;
    const selectedBoxInputCount =
      selectedBox && Array.isArray(selectedBox.inputs)
        ? (selectedBox.inputs as string[]).filter((v) => String(v).trim()).length
        : 0;
    const effectiveInputCount = selectedBox ? selectedBoxInputCount || globalInputCount : globalInputCount;
    if (!boxCount || !effectiveInputCount) return 0;
    return boxCount * effectiveInputCount;
  }, [boxes.length, runInputs, selectedBox, selectedNodeId]);

  const handleCsvImport = async () => {
    if (!csvFile) {
      toast.showToast('CSV 파일을 선택해주세요.', 'warning');
      return;
    }
    if (!csvInputColumn) {
      toast.showToast('Input으로 사용할 컬럼을 선택해주세요.', 'warning');
      return;
    }
    try {
      setCsvLoading(true);
      const res = await testLabAPI.importCsv(projectId, csvFile, csvInputColumn);
      setCsvHeaders(res.headers || []);
      setCsvPreviewRows(res.preview_rows || []);
      setCsvImportedCount(res.imported_count ?? null);
      setCsvSkippedCount(res.skipped_count ?? null);

      const inputs: string[] = res.inputs || [];
      if (inputs.length) {
        setRunInputs(inputs.join('\n'));
        toast.showToast(`CSV에서 ${inputs.length}개의 테스트 입력을 불러왔습니다.`, 'success');
      } else {
        toast.showToast('유효한 입력 행을 찾지 못했습니다.', 'warning');
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        'CSV를 가져오지 못했습니다.';
      toast.showToast(message, 'error');
    } finally {
      setCsvLoading(false);
    }
  };

  if (!orgId || !projectId) return null;

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: `Project ${projectId}`, href: `/organizations/${orgId}/projects/${projectId}` },
        { label: 'Test Lab' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        {concurrencyError && (
          <div className="mb-4 rounded-md border border-yellow-500/60 bg-yellow-500/10 px-3 py-2 text-xs flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-yellow-200">다른 테스트가 실행 중입니다.</div>
              <div className="text-yellow-100/80">
                {concurrencyError.message ||
                  '동시에 실행할 수 있는 테스트 개수를 초과했습니다. 다른 테스트가 끝난 후 다시 시도해주세요.'}
              </div>
              {typeof concurrencyError.limit === 'number' && (
                <div className="mt-1 text-[11px] text-yellow-100/80">
                  최대 동시 테스트: {concurrencyError.limit}개 (현재 실행 중:{' '}
                  {concurrencyError.current ?? '알 수 없음'}개)
                </div>
              )}
            </div>
            <button
              type="button"
              className="ml-2 text-yellow-200/80 hover:text-yellow-50 text-xs"
              onClick={() => setConcurrencyError(null)}
            >
              닫기
            </button>
          </div>
        )}

        {limitError && (
          <div className="mb-4 rounded-md border border-sky-500/60 bg-sky-500/10 px-3 py-2 text-xs flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sky-200">테스트 한도에 도달했습니다.</div>
              <div className="text-sky-100/80">
                {limitError.message ||
                  '현재 플랜에서 허용된 입력/호출 한도를 초과했습니다. 입력 수를 줄이거나 플랜을 업그레이드해주세요.'}
              </div>
              {typeof limitError.limit === 'number' && typeof limitError.requested === 'number' && (
                <div className="mt-1 text-[11px] text-sky-100/80">
                  허용 한도: {limitError.limit} / 요청: {limitError.requested}
                </div>
              )}
            </div>
            <button
              type="button"
              className="ml-2 text-sky-200/80 hover:text-sky-50 text-xs underline"
              onClick={() => {
                window.location.href = '/settings/billing';
              }}
            >
              Upgrade plan
            </button>
          </div>
        )}

        <ProjectTabs projectId={projectId} orgId={orgId} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Beaker className="w-5 h-5 text-ag-accent" />
            <h2 className="text-lg font-semibold">Test Lab</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            {estimatedCalls > 0 && (
              <div className="text-[11px] text-ag-muted">
                Estimated calls for next run:{' '}
                <span className="font-semibold text-ag-text">{estimatedCalls}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleAddBox}>
                <Plus className="w-4 h-4 mr-1" /> Add Box
              </Button>
              <Button
                variant={arrowMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setArrowMode((prev) => !prev)}
              >
                <Link2 className="w-4 h-4 mr-1" /> {arrowMode ? 'Arrow Mode On' : 'Arrow Mode'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setIsCsvModalOpen(true)}>
                <UploadCloud className="w-4 h-4 mr-1" /> Import CSV
              </Button>
              <Button
                size="sm"
                onClick={handleRunTest}
                disabled={isRunning || !boxes.length || isConcurrencyBlocked}
              >
                <Play className="w-4 h-4 mr-1" /> {isRunning ? 'Running...' : 'Test'}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas list + inputs */}
          <div className="space-y-4">
            <div className="border border-white/10 rounded-lg p-4 bg-white/5">
              <h3 className="text-sm font-semibold mb-2">Canvases</h3>
              <div className="space-y-1">
                {canvases.map((canvas) => (
                  <button
                    key={canvas.id}
                    onClick={() => handleSelectCanvas(canvas)}
                    className={clsx(
                      'w-full text-left text-sm px-3 py-2 rounded-md border',
                      activeCanvasId === canvas.id
                        ? 'border-ag-accent bg-ag-accent/10'
                        : 'border-white/10 bg-black/40 hover:bg-white/10',
                    )}
                  >
                    {canvas.name}
                  </button>
                ))}
                {!canvases.length && (
                  <div className="text-xs text-ag-muted">Initializing default Test Lab canvas...</div>
                )}
              </div>
            </div>

            <div className="border border-white/10 rounded-lg p-4 bg-white/5">
              <h3 className="text-sm font-semibold mb-2">Test Inputs</h3>
              <p className="text-xs text-ag-muted mb-2">
                한 줄당 하나의 input으로 처리됩니다. 여러 줄을 입력하면 체인 테스트에 여러 input이 사용됩니다.
              </p>
              <textarea
                className="w-full h-40 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm"
                placeholder="Enter test inputs, one per line..."
                value={runInputs}
                onChange={(e) => setRunInputs(e.target.value)}
              />
            </div>
          </div>

          {/* Canvas + box settings */}
          <div className="lg:col-span-1 border border-white/10 rounded-lg p-4 bg-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Canvas ({boxes.length}/30)</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveCanvas}
                disabled={!boxes.length}
              >
                Save Canvas
              </Button>
            </div>
            {boxes.length === 0 ? (
              <div className="text-xs text-ag-muted">
                아직 박스가 없습니다. 상단의 &quot;Add Box&quot; 버튼을 눌러 첫 박스를 추가하세요.
              </div>
            ) : (
              <div className="h-64 border border-white/10 rounded-md bg-black/40 overflow-hidden">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange}
                  onConnect={handleConnect}
                  fitView
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                >
                  <Background />
                  <MiniMap />
                  <Controls />
                </ReactFlow>
              </div>
            )}

            {/* Box settings panel */}
            <div className="mt-3 border-t border-white/10 pt-3">
              <h4 className="text-xs font-semibold mb-2">Box Settings</h4>
              {!selectedBox ? (
                <div className="text-xs text-ag-muted">
                  캔버스에서 박스를 선택하면 상세 설정을 편집할 수 있습니다.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="text-ag-muted">ID: {selectedBox.id}</div>
                  <div className="flex items-center justify-between text-[11px] text-ag-muted">
                    <span>
                      Inputs:{' '}
                      <span className="font-semibold">
                        {Array.isArray(selectedBox.inputs) ? selectedBox.inputs.length : 0}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRunTest}
                      disabled={isRunning || isConcurrencyBlocked}
                    >
                      <Play className="w-3 h-3 mr-1" /> Test this box
                    </Button>
                  </div>
                  <input
                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                    placeholder="Label"
                    value={selectedBox.label || ''}
                    onChange={(e) =>
                      handleBoxFieldChange(String(selectedBox.id), 'label', e.target.value)
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-ag-muted mb-1">Provider</label>
                      <select
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                        value={selectedBox.provider || 'openai'}
                        onChange={(e) => {
                          const provider = e.target.value;
                          handleBoxFieldChange(String(selectedBox.id), 'provider', provider);
                          const firstModel = MODEL_OPTIONS[provider]?.[0]?.id;
                          if (firstModel) {
                            handleBoxFieldChange(String(selectedBox.id), 'model', firstModel);
                          }
                        }}
                      >
                        {PROVIDER_OPTIONS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-ag-muted mb-1">Model</label>
                      {selectedBox.provider && selectedBox.provider !== 'custom' ? (
                        <select
                          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                          value={selectedBox.model || ''}
                          onChange={(e) =>
                            handleBoxFieldChange(
                              String(selectedBox.id),
                              'model',
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Select model</option>
                          {(MODEL_OPTIONS[selectedBox.provider] || []).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                          placeholder="Custom model id (e.g. mistral-large)"
                          value={selectedBox.model || ''}
                          onChange={(e) =>
                            handleBoxFieldChange(
                              String(selectedBox.id),
                              'model',
                              e.target.value,
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                  {selectedBox.provider === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-ag-muted mb-1">API Key</label>
                        <input
                          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                          placeholder="Custom provider API key"
                          value={selectedBox.custom_api_key || ''}
                          onChange={(e) =>
                            handleBoxFieldChange(
                              String(selectedBox.id),
                              'custom_api_key',
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-ag-muted mb-1">Base URL (optional)</label>
                        <input
                          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                          placeholder="https://api.your-llm.com/v1"
                          value={selectedBox.base_url || ''}
                          onChange={(e) =>
                            handleBoxFieldChange(
                              String(selectedBox.id),
                              'base_url',
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  )}
                  <textarea
                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                    rows={3}
                    placeholder="System prompt"
                    value={selectedBox.system_prompt || ''}
                    onChange={(e) =>
                      handleBoxFieldChange(
                        String(selectedBox.id),
                        'system_prompt',
                        e.target.value,
                      )
                    }
                  />
                  <div>
                    <label className="block text-[10px] text-ag-muted mb-1">
                      Box Inputs (one per line)
                    </label>
                    <textarea
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                      rows={4}
                      placeholder="이 박스에서만 사용할 input들을 한 줄에 하나씩 입력하세요."
                      value={
                        Array.isArray(selectedBox.inputs)
                          ? (selectedBox.inputs as string[]).join('\n')
                          : ''
                      }
                      onChange={(e) =>
                        handleBoxInputsChange(String(selectedBox.id), e.target.value)
                      }
                    />
                  </div>
                  <p className="text-[10px] text-ag-muted">
                    CSV로 불러온 입력은 기본적으로 상단 &quot;Test Inputs&quot; 영역에서 관리됩니다.
                    박스별 Input을 지정하면, 선택된 박스를 테스트할 때 우선적으로 사용됩니다.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Results with filters */}
          <div className="lg:col-span-1 border border-white/10 rounded-lg p-4 bg-white/5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Results</h3>
              <span className="text-xs text-ag-muted">{results.length} steps</span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              {(['all', 'needs_review', 'critical', 'worst'] as ResultFilter[]).map((f) => (
                <Button
                  key={f}
                  variant={resultFilter === f ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setResultFilter(f)}
                >
                  {f === 'all'
                    ? 'All'
                    : f === 'needs_review'
                      ? 'Needs review'
                      : f === 'critical'
                        ? 'Critical'
                        : 'Worst only'}
                </Button>
              ))}
            </div>

            {results.length === 0 ? (
              <div className="h-full min-h-[200px] flex items-center justify-center text-xs text-ag-muted">
                아직 실행 결과가 없습니다. 상단의 &quot;Test&quot; 버튼을 눌러 체인을 실행하세요.
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto text-xs">
                {Object.entries(groupedResults).map(([key, group]) => {
                  const [agentId, input] = key.split('::');
                  return (
                    <div
                      key={key}
                      className="border border-white/10 rounded-md p-3 bg-black/40 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {agentId !== 'unknown' ? agentId : 'Unknown agent'}
                          </span>
                          {input && (
                            <span className="text-ag-muted max-w-md truncate">
                              <span className="font-semibold">Input:</span> {input}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {group
                          .slice()
                          .sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))
                          .map((res) => {
                            const status = res.signal_result?.status;
                            const isWorst = res.is_worst || res.signal_result?.is_worst;
                            return (
                              <div
                                key={res.id}
                                className={clsx(
                                  'border border-white/10 rounded-md p-2 space-y-1',
                                  status === 'critical'
                                    ? 'border-red-500/60 bg-red-500/10'
                                    : status === 'needs_review'
                                      ? 'border-yellow-500/60 bg-yellow-500/10'
                                      : 'bg-black/40',
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">
                                    Step {res.step_order ?? '-'}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {status && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-white/10">
                                        {status}
                                      </span>
                                    )}
                                    {isWorst && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/80 text-black font-semibold">
                                        WORST
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {res.response && (
                                  <div className="text-ag-muted line-clamp-3">
                                    <span className="font-semibold">Response:</span>{' '}
                                    {res.response}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!!results.length && (
              <div className="mt-3 text-[10px] text-ag-muted flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                이 실행에서 문제가 감지된 케이스는 자동으로 Review 큐에 추가됩니다. 상세 검토는 상단
                탭의 Reviews 페이지에서 진행할 수 있습니다.
              </div>
            )}
            <div className="mt-1 text-[10px] text-ag-muted flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />
              이 Test Lab 실행은 실제 LLM 호출과 Signal 평가 결과를 기반으로 합니다.
            </div>
          </div>
        </div>

        {/* CSV import modal */}
        <Modal
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          title="Load Test Data from CSV"
        >
          <div className="space-y-4 text-sm">
            <p className="text-ag-muted">
              CSV 파일을 업로드하고 테스트 입력으로 사용할 컬럼을 선택하세요.
            </p>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-ag-muted">CSV 파일</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCsvFile(file);
                  setCsvHeaders([]);
                  setCsvPreviewRows([]);
                  setCsvImportedCount(null);
                  setCsvSkippedCount(null);
                }}
                className="w-full text-xs text-ag-muted"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-ag-muted">Input 컬럼 이름</label>
              <input
                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                placeholder="예: prompt"
                value={csvInputColumn}
                onChange={(e) => setCsvInputColumn(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-ag-muted">
              <div className="space-y-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    // Download simple one-column template with "input" header
                    const content = 'input\n';
                    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', 'test_lab_template.csv');
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                  }}
                >
                  템플릿 다운로드
                </Button>
                {csvImportedCount !== null && (
                  <div>
                    Import된 행: <span className="font-semibold">{csvImportedCount}</span>
                  </div>
                )}
                {csvSkippedCount !== null && (
                  <div>
                    비어있는 행(스킵): <span className="font-semibold">{csvSkippedCount}</span>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleCsvImport}
                disabled={!csvFile || !csvInputColumn || csvLoading}
              >
                {csvLoading ? '불러오는 중...' : '미리보기 & 적용'}
              </Button>
            </div>

            {csvHeaders.length > 0 && csvPreviewRows.length > 0 && (
              <div className="border border-white/10 rounded-md max-h-48 overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-white/5">
                    <tr>
                      {csvHeaders.map((h) => (
                        <th key={h} className="px-2 py-1 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreviewRows.map((row, idx) => (
                      <tr key={idx} className="border-t border-white/5">
                        {csvHeaders.map((h) => (
                          <td key={h} className="px-2 py-1 text-ag-muted">
                            {row[h] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </ProjectLayout>
  );
}

