'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronRight, ExternalLink, Flag, Loader2, Plus, RefreshCcw, ShieldCheck, ShieldX, Trash2, Upload, Activity } from 'lucide-react';

import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import { SnapshotDetailModal, type SnapshotForDetail } from '@/components/shared/SnapshotDetailModal';
import { AgentNodePickerModal } from '@/components/release-gate/AgentNodePickerModal';
import type { AgentForPicker } from '@/components/release-gate/AgentPickerCard';
import { DatasetPickerModal } from '@/components/release-gate/DatasetPickerModal';
import { NodeAndDataPickerModal } from '@/components/release-gate/NodeAndDataPickerModal';
import { PassRateGauge } from '@/components/release-gate/PassRateGauge';
import {
  behaviorAPI,
  liveViewAPI,
  organizationsAPI,
  projectsAPI,
  releaseGateAPI,
  type ReleaseGateHistoryResponse,
  type ReleaseGateResult,
} from '@/lib/api';

type GateTab = 'validate' | 'history';
/** Regression: baseline eval is at capture time; run uses current eval (source of truth). Drift: compare recorded vs re-evaluated with current config. */
type EvalMode = 'regression' | 'stability' | 'drift';
type EditableTool = { id: string; name: string; description: string; parameters: string };
const RECENT_SNAPSHOT_LIMIT = 100;
const BASELINE_SNAPSHOT_LIMIT = 200;

function toNum(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractToolsFromPayload(payload: Record<string, unknown> | null): EditableTool[] {
  if (!payload) return [];
  const rawTools = payload.tools;
  if (!Array.isArray(rawTools)) return [];
  const out: EditableTool[] = [];
  for (const item of rawTools) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const fnRaw = obj.function;
    const fn = fnRaw && typeof fnRaw === 'object' ? (fnRaw as Record<string, unknown>) : {};
    const name = String(fn.name ?? obj.name ?? '').trim();
    if (!name) continue;
    const description = typeof fn.description === 'string' ? fn.description : (typeof obj.description === 'string' ? obj.description : '');
    const paramsObj = fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : (obj.parameters && typeof obj.parameters === 'object' ? obj.parameters : null);
    out.push({
      id: crypto.randomUUID(),
      name,
      description,
      parameters: paramsObj ? JSON.stringify(paramsObj, null, 2) : '{}',
    });
  }
  return out;
}

function extractOverridesFromPayload(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  const clone = { ...payload };
  // Keep replay-overridable request knobs only; exclude prompt/body bulk fields.
  delete clone.model;
  delete clone.messages;
  delete clone.tools;
  delete clone.stream;
  delete clone.temperature;
  delete clone.max_tokens;
  delete clone.top_p;
  return clone;
}

/** When payload is { request, response }, return the request part; else return payload. */
function getRequestPart(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  if (payload.request && typeof payload.request === 'object' && !Array.isArray(payload.request)) return payload.request as Record<string, unknown>;
  return payload;
}

/** Derive eval pass/fail from snapshot (eval_checks_result or is_worst). */
function snapshotEvalFailed(snap: Record<string, unknown> | null): boolean {
  if (!snap) return false;
  const checks = snap.eval_checks_result;
  if (checks && typeof checks === 'object' && !Array.isArray(checks)) {
    const vals = Object.values(checks);
    if (vals.some((v) => v === 'fail')) return true;
  }
  return Boolean(snap.is_worst);
}

/** Request body for replay: same as payload but without model (model is UI-only). */
function payloadWithoutModel(payload: Record<string, unknown> | null): Record<string, unknown> {
  const part = getRequestPart(payload);
  if (!Object.keys(part).length) return {};
  const clone = JSON.parse(JSON.stringify(part)) as Record<string, unknown>;
  delete clone.model;
  return clone;
}

/** Apply system prompt text to request body (top-level and messages if present). */
function applySystemPromptToBody(body: Record<string, unknown>, systemPrompt: string): Record<string, unknown> {
  const next = { ...body };
  next.system_prompt = systemPrompt || undefined;
  const msgs = next.messages;
  if (Array.isArray(msgs)) {
    let found = false;
    const nextMsgs = msgs.map((msg: unknown) => {
      if (!msg || typeof msg !== 'object') return msg;
      const m = { ...(msg as Record<string, unknown>) };
      if (m.role === 'system') {
        found = true;
        m.content = systemPrompt;
      }
      return m;
    });
    if (!found && systemPrompt) nextMsgs.unshift({ role: 'system', content: systemPrompt });
    next.messages = nextMsgs;
  }
  return next;
}

function extractSystemPromptFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  const direct = payload.system_prompt;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const msgs = payload.messages;
  if (!Array.isArray(msgs)) return '';
  for (const msg of msgs) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as Record<string, unknown>;
    if (m.role !== 'system') continue;
    const content = m.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
  }
  return '';
}

function formatEvalSetting(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Configured';

  const obj = value as Record<string, unknown>;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : undefined;
  const details = Object.entries(obj)
    .filter(([k, v]) => k !== 'enabled' && v !== undefined && v !== null)
    .slice(0, 2)
    .map(([k, v]) => {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return `${k}:${String(v)}`;
      return `${k}:set`;
    })
    .join(' · ');

  if (enabled === false) return details ? `Off · ${details}` : 'Off';
  if (enabled === true) return details ? `On · ${details}` : 'On';
  return details || 'Configured';
}

function shouldShowEvalSetting(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const obj = value as Record<string, unknown>;
  if (typeof obj.enabled === 'boolean') return obj.enabled;
  return true;
}

const LIVE_VIEW_CHECK_ORDER = [
  'empty',
  'latency',
  'status_code',
  'refusal',
  'json',
  'length',
  'repetition',
  'tokens',
  'cost',
] as const;

const LIVE_VIEW_CHECK_LABELS: Record<string, string> = {
  empty: 'Empty / Short Answers',
  latency: 'Latency Spikes',
  status_code: 'HTTP Error Codes',
  refusal: 'Refusal / Non-Answer',
  json: 'JSON Validity',
  length: 'Output Length Drift',
  repetition: 'Repetition / Loops',
  required: 'Required Keywords / Fields',
  format: 'Format / Sections',
  tokens: 'Token Usage Spikes',
  cost: 'High Cost Alert',
  leakage: 'PII / Secret Leakage',
  coherence: 'Coherence',
};

function ModelSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const PRESETS = [
    { id: '', label: 'Original Model', desc: 'Use baseline model' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'fast & cheap' },
    { id: 'gpt-4o', label: 'GPT-4o', desc: 'high precision' },
    { id: 'o1-preview', label: 'o1-preview', desc: 'reasoning' },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onClick={() => !isOpen && setIsOpen(true)}
        placeholder="e.g. gpt-4o (empty = original)"
        className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none"
      />
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#1A1B20] border border-white/10 rounded-xl shadow-xl overflow-hidden py-1">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5 mb-1">
            Suggested Models
          </div>
          {PRESETS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between group"
              onClick={() => {
                onChange(m.id);
                setIsOpen(false);
              }}
            >
              <span className="text-sm text-slate-200 group-hover:text-white transition-colors">{m.label}</span>
              <span className="text-xs text-slate-500">{m.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReleaseGatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orgId = params?.orgId as string;
  const rawProjectId = params?.projectId;
  const projectIdStr = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const projectId = projectIdStr ? Number(projectIdStr) : 0;

  const { data: project } = useSWR(
    projectId && !isNaN(projectId) ? ['project', projectId] : null,
    () => projectsAPI.get(projectId)
  );
  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () => organizationsAPI.get(orgId));

  const [tab, setTab] = useState<GateTab>('validate');
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ReleaseGateResult | null>(null);
  const [error, setError] = useState('');

  const [evalMode, setEvalMode] = useState<EvalMode>('regression');
  const [agentId, setAgentId] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentForPicker | null>(null);
  const [agentSelectModalOpen, setAgentSelectModalOpen] = useState(false);
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<'recent' | 'datasets'>('recent');
  const [snapshotIds, setSnapshotIds] = useState<string[]>([]);
  const [datasetSelectModalOpen, setDatasetSelectModalOpen] = useState(false);
  const [nodeAndDataModalOpen, setNodeAndDataModalOpen] = useState(false);
  const [newModel, setNewModel] = useState('');
  const [requestBody, setRequestBody] = useState<Record<string, unknown>>({});
  const [requestJsonDraft, setRequestJsonDraft] = useState<string | null>(null);
  const [requestJsonError, setRequestJsonError] = useState('');
  const [temperatureDraft, setTemperatureDraft] = useState<string | null>(null);
  const [maxTokensDraft, setMaxTokensDraft] = useState<string | null>(null);
  const [toolsList, setToolsList] = useState<EditableTool[]>([]);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [toolsHydratedKey, setToolsHydratedKey] = useState('');
  const [overridesHydratedKey, setOverridesHydratedKey] = useState('');

  const [runDatasetIds, setRunDatasetIds] = useState<string[]>([]);
  const [runSnapshotIds, setRunSnapshotIds] = useState<string[]>([]);

  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const [historyStatus, setHistoryStatus] = useState<'all' | 'pass' | 'fail'>('all');
  const [historyTraceId, setHistoryTraceId] = useState('');
  const [historyOffset, setHistoryOffset] = useState(0);
  const historyLimit = 20;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resultDetailsOpen, setResultDetailsOpen] = useState(false);
  const [selectedDriftRunIndex, setSelectedDriftRunIndex] = useState<number | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [lastRunReportId, setLastRunReportId] = useState<string | null>(null);
  const [driftDetailSnapshot, setDriftDetailSnapshot] = useState<SnapshotForDetail | null>(null);
  const [baselineDetailSnapshot, setBaselineDetailSnapshot] = useState<SnapshotForDetail | null>(null);

  useEffect(() => {
    const qAgent = searchParams.get('agent_id') || '';
    if (qAgent) setAgentId(qAgent);
  }, [searchParams]);

  useEffect(() => {
    setSelectedDriftRunIndex(null);
  }, [result?.report_id]);

  const agentsKey = projectId && !isNaN(projectId) ? ['release-gate-agents', projectId] : null;
  const { data: agentsData, isLoading: agentsLoading } = useSWR(agentsKey, () => releaseGateAPI.getAgents(projectId, 50));
  const agents = useMemo((): AgentForPicker[] => {
    const list = agentsData?.items ?? [];
    return list
      .map((a: { agent_id?: string; display_name?: string }) => ({
        agent_id: a.agent_id ?? '',
        display_name: a.display_name || a.agent_id || 'Agent',
        model: null,
        worst_count: 0,
        is_ghost: false,
      }))
      .filter((a: AgentForPicker) => a.agent_id);
  }, [agentsData]);

  useEffect(() => {
    if (agentId && agents.length > 0) {
      const match = agents.find((a) => a.agent_id === agentId);
      setSelectedAgent((prev) => (prev?.agent_id === agentId ? prev : match ?? null));
    } else if (!agentId) {
      setSelectedAgent(null);
    }
  }, [agentId, agents]);

  useEffect(() => {
    setRunDatasetIds(datasetIds.length ? [...datasetIds] : []);
  }, [datasetIds.join(',')]);
  useEffect(() => {
    setRunSnapshotIds(snapshotIds.length ? [...snapshotIds] : []);
  }, [snapshotIds.join(',')]);

  const datasetsKey =
    projectId && !isNaN(projectId) && agentId?.trim()
      ? ['behavior-datasets', projectId, agentId.trim()]
      : null;
  const { data: datasetsData, isLoading: datasetsLoading } = useSWR(datasetsKey, () =>
    behaviorAPI.listDatasets(projectId, { agent_id: agentId.trim(), limit: 50 })
  );
  const datasets = datasetsData?.items ?? [];

  // For Drift preview: fetch snapshots from the FIRST selected dataset only, to avoid complex multi-fetch.
  const previewDatasetId = datasetIds.length > 0 ? datasetIds[0] : null;

  const datasetSnapshotsKey =
    (evalMode === 'drift' || evalMode === 'regression') &&
      dataSource === 'datasets' &&
      projectId &&
      !isNaN(projectId) &&
      previewDatasetId
      ? ['behavior-dataset-snapshots', projectId, previewDatasetId]
      : null;
  const {
    data: datasetSnapshotsData,
    isLoading: datasetSnapshotsLoading,
    error: datasetSnapshotsError,
  } = useSWR(
    datasetSnapshotsKey,
    async () => {
      try {
        return await behaviorAPI.getDatasetSnapshots(projectId, previewDatasetId!);
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return { items: [], total: 0, _404: true };
        }
        throw e;
      }
    }
  );
  const datasetSnapshots = datasetSnapshotsData?.items ?? [];
  const datasetSnapshots404 = !!(datasetSnapshotsData as { _404?: boolean } | undefined)?._404;

  const recentSnapshotsKey =
    (evalMode === 'drift' || evalMode === 'regression') &&
      dataSource === 'recent' &&
      projectId &&
      !isNaN(projectId) &&
      agentId?.trim() &&
      snapshotIds.length > 0
      ? ['release-gate-recent-snapshots', projectId, agentId.trim(), RECENT_SNAPSHOT_LIMIT]
      : null;
  const { data: recentSnapshotsData } = useSWR(
    recentSnapshotsKey,
    () => releaseGateAPI.getRecentSnapshots(projectId, agentId.trim(), RECENT_SNAPSHOT_LIMIT)
  );
  const recentSnapshotsAll = recentSnapshotsData?.items ?? [];
  const recentSnapshots = useMemo(
    () => recentSnapshotsAll.filter((s: { id: string | number }) => snapshotIds.includes(String(s.id))),
    [recentSnapshotsAll, snapshotIds]
  );

  const baselineSnapshotPoolKey =
    evalMode === 'regression' &&
      projectId &&
      !isNaN(projectId) &&
      agentId?.trim()
      ? ['release-gate-baseline-payloads', projectId, agentId.trim(), BASELINE_SNAPSHOT_LIMIT]
      : null;
  const { data: baselineSnapshotPoolData } = useSWR(
    baselineSnapshotPoolKey,
    () => liveViewAPI.listSnapshots(projectId, { agent_id: agentId.trim(), limit: BASELINE_SNAPSHOT_LIMIT, offset: 0 })
  );
  const baselineSnapshotPool = baselineSnapshotPoolData?.items ?? [];

  const selectedSnapshotIdsForRun = useMemo(() => {
    if (dataSource === 'recent') return runSnapshotIds.map((x) => String(x));
    if (dataSource === 'datasets') {
      return datasetSnapshots.map((s: any) => String(s.id));
    }
    return [];
  }, [dataSource, runSnapshotIds, datasetSnapshots]);

  const baselineSnapshotsById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    const isRichSnapshot = (s: Record<string, unknown> | undefined) => {
      if (!s) return false;
      if (typeof s.model === 'string' && s.model.trim()) return true;
      if (typeof s.system_prompt === 'string' && s.system_prompt.trim()) return true;
      const p = s.payload;
      return Boolean(p && typeof p === 'object' && !Array.isArray(p));
    };
    const upsertSnapshot = (s: Record<string, unknown>) => {
      const id = s?.id;
      if (id == null) return;
      const key = String(id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, s);
        return;
      }
      const existingRich = isRichSnapshot(existing);
      const incomingRich = isRichSnapshot(s);
      if (existingRich && !incomingRich) {
        // Keep rich baseline metadata; only fill missing skinny fields.
        map.set(key, { ...s, ...existing });
        return;
      }
      map.set(key, { ...existing, ...s });
    };

    for (const s of baselineSnapshotPool as Array<Record<string, unknown>>) upsertSnapshot(s);
    for (const s of datasetSnapshots as Array<Record<string, unknown>>) upsertSnapshot(s);
    for (const s of recentSnapshotsAll as Array<Record<string, unknown>>) upsertSnapshot(s);
    return map;
  }, [baselineSnapshotPool, datasetSnapshots, recentSnapshotsAll]);

  const baselineSnapshotsForRun = useMemo(
    () =>
      selectedSnapshotIdsForRun
        .map((id) => baselineSnapshotsById.get(id))
        .filter((s): s is Record<string, unknown> => Boolean(s)),
    [selectedSnapshotIdsForRun, baselineSnapshotsById]
  );
  const baselineSeedSnapshot = baselineSnapshotsForRun[0] ?? null;
  const baselinePayload = useMemo(() => {
    const raw = baselineSeedSnapshot?.payload;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  }, [baselineSeedSnapshot]);
  const baselineTools = useMemo(() => extractToolsFromPayload(baselinePayload), [baselinePayload]);
  const baselineOverrides = useMemo(() => extractOverridesFromPayload(baselinePayload), [baselinePayload]);

  const historyKey = useMemo(
    () =>
      projectId && !isNaN(projectId)
        ? ['release-gate-history', projectId, historyStatus, historyTraceId, historyOffset]
        : null,
    [projectId, historyStatus, historyTraceId, historyOffset]
  );

  const {
    data: historyData,
    mutate: mutateHistory,
    isLoading: historyLoading,
  } = useSWR<ReleaseGateHistoryResponse>(
    historyKey,
    () =>
      releaseGateAPI.listHistory(projectId, {
        status: historyStatus === 'all' ? undefined : historyStatus,
        trace_id: historyTraceId.trim() || undefined,
        limit: historyLimit,
        offset: historyOffset,
      }),
    { keepPreviousData: true }
  );

  const historyItems = historyData?.items || [];
  const historyTotal = historyData?.total || 0;

  const { data: selectedRunReport } = useSWR(
    selectedRunId && projectId && !isNaN(projectId) ? ['release-gate-report', projectId, selectedRunId] : null,
    () => behaviorAPI.exportReport(projectId, selectedRunId!, 'json')
  );

  const singleSnapshotEvalKey = agentId?.trim() && projectId && !isNaN(projectId) ? ['agent-eval', projectId, agentId] : null;
  const { data: agentEvalData } = useSWR(singleSnapshotEvalKey, () => liveViewAPI.getAgentEvaluation(projectId, agentId));
  const liveNodeLatestKey =
    agentId?.trim() && projectId && !isNaN(projectId)
      ? ['release-gate-live-node-latest', projectId, agentId.trim()]
      : null;
  const { data: liveNodeLatestData } = useSWR(
    liveNodeLatestKey,
    () => liveViewAPI.listSnapshots(projectId, { agent_id: agentId.trim(), limit: 1, offset: 0 })
  );
  const liveNodeLatestSnapshot = useMemo(() => {
    const items = (liveNodeLatestData as Record<string, unknown> | undefined)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }, [liveNodeLatestData]);

  const runDataModel = useMemo(() => {
    const latestModel = liveNodeLatestSnapshot?.model;
    if (typeof latestModel === 'string' && latestModel.trim()) return latestModel.trim();
    const fromSnapshot = baselineSeedSnapshot?.model;
    if (typeof fromSnapshot === 'string' && fromSnapshot.trim()) return fromSnapshot.trim();
    const latestPayload = liveNodeLatestSnapshot?.payload;
    if (latestPayload && typeof latestPayload === 'object' && !Array.isArray(latestPayload)) {
      const pModel = (latestPayload as Record<string, unknown>).model;
      if (typeof pModel === 'string' && pModel.trim()) return pModel.trim();
    }
    const fromPayload = baselinePayload?.model;
    if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload.trim();
    return '';
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, baselinePayload]);
  const runDataPrompt = useMemo(() => {
    const latestPrompt = liveNodeLatestSnapshot?.system_prompt;
    if (typeof latestPrompt === 'string' && latestPrompt.trim()) return latestPrompt.trim();
    const latestPayload = liveNodeLatestSnapshot?.payload;
    if (latestPayload && typeof latestPayload === 'object' && !Array.isArray(latestPayload)) {
      const extracted = extractSystemPromptFromPayload(latestPayload as Record<string, unknown>);
      if (extracted) return extracted;
    }
    const fromSnapshot = baselineSeedSnapshot?.system_prompt;
    if (typeof fromSnapshot === 'string' && fromSnapshot.trim()) return fromSnapshot.trim();
    return extractSystemPromptFromPayload(baselinePayload);
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, baselinePayload]);
  const runEvalElements = useMemo(() => {
    const data = agentEvalData as Record<string, unknown> | undefined;
    const configSrc = data?.config as Record<string, unknown> | undefined;
    if (configSrc && typeof configSrc === 'object' && !Array.isArray(configSrc)) {
      const fromConfig = LIVE_VIEW_CHECK_ORDER.map((name) => ({ name, value: configSrc[name] }))
        .filter(({ value }) => value !== undefined && shouldShowEvalSetting(value));
      if (fromConfig.length > 0) return fromConfig;
    }
    // Fallback: use checks from evaluation API (applied to recent logs, e.g. from stored eval_checks_result when no AgentDisplaySetting)
    const checksList = data?.checks as Array<{ id: string; enabled?: boolean; applicable?: number }> | undefined;
    if (Array.isArray(checksList) && checksList.length > 0) {
      const applied = checksList
        .filter((c) => c.enabled === true || (Number(c.applicable) ?? 0) > 0)
        .map((c) => ({ name: c.id, value: { enabled: true } as unknown }));
      if (applied.length > 0) {
        const order = [...LIVE_VIEW_CHECK_ORDER, 'required', 'format', 'leakage', 'coherence'];
        const idx = (name: string) => {
          const i = order.indexOf(name);
          return i === -1 ? 999 : i;
        };
        applied.sort((a, b) => idx(a.name) - idx(b.name));
        return applied;
      }
    }
    return [] as Array<{ name: string; value: unknown }>;
  }, [agentEvalData]);

  const canValidate =
    !!agentId?.trim() &&
    ((dataSource === 'recent' && runSnapshotIds.length > 0) || (dataSource === 'datasets' && runDatasetIds.length > 0));

  const requestSystemPrompt = useMemo(
    () => (typeof requestBody.system_prompt === 'string' ? requestBody.system_prompt : extractSystemPromptFromPayload(requestBody)) || '',
    [requestBody]
  );

  const handleRequestJsonBlur = useCallback(() => {
    const raw = requestJsonDraft ?? JSON.stringify(requestBody, null, 2);
    const trimmed = raw.trim();
    if (!trimmed) {
      setRequestBody({});
      setRequestJsonDraft(null);
      setRequestJsonError('');
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setRequestJsonError('Must be a JSON object.');
        return;
      }
      const obj = parsed as Record<string, unknown>;
      delete obj.model;
      setRequestBody(obj);
      setRequestJsonDraft(null);
      setRequestJsonError('');
    } catch {
      setRequestJsonError('Invalid JSON.');
    }
  }, [requestJsonDraft, requestBody]);

  const handleResetRequestJson = useCallback(() => {
    if (!baselinePayload) return;
    setRequestBody(payloadWithoutModel(baselinePayload));
    setRequestJsonDraft(null);
    setRequestJsonError('');
  }, [baselinePayload]);

  useEffect(() => {
    if (toolsList.length === 0) {
      setRequestBody((prev) => {
        const next = { ...prev };
        delete next.tools;
        return next;
      });
      return;
    }
    const built: Array<Record<string, unknown>> = [];
    for (const t of toolsList) {
      const name = t.name.trim();
      if (!name) continue;
      let params: Record<string, unknown> = {};
      if (t.parameters.trim()) {
        try {
          const p = JSON.parse(t.parameters.trim());
          if (p && typeof p === 'object') params = p as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      built.push({
        type: 'function',
        function: { name, description: t.description.trim() || undefined, ...(Object.keys(params).length ? { parameters: params } : {}) },
      });
    }
    if (built.length) setRequestBody((prev) => ({ ...prev, tools: built }));
  }, [toolsList]);

  useEffect(() => {
    if (evalMode !== 'regression') return;
    const selectionKey = selectedSnapshotIdsForRun.join(',');
    if (!selectionKey) return;
    if (!baselineSeedSnapshot || !baselinePayload) return;

    if (selectionKey !== toolsHydratedKey) {
      setToolsList(baselineTools);
      setToolsHydratedKey(selectionKey);
    }

    if (selectionKey !== overridesHydratedKey) {
      setRequestBody(payloadWithoutModel(baselinePayload));
      setNewModel(runDataModel);
      setRequestJsonError('');
      setOverridesHydratedKey(selectionKey);
    }
  }, [
    evalMode,
    selectedSnapshotIdsForRun,
    baselineSeedSnapshot,
    baselinePayload,
    baselineTools,
    runDataModel,
    toolsHydratedKey,
    overridesHydratedKey,
  ]);

  const handleValidate = async () => {
    if (!projectId || isNaN(projectId) || !canValidate || isValidating) return;
    setIsValidating(true);
    setError('');
    try {
      const payload: Parameters<typeof releaseGateAPI.validate>[1] = {
        agent_id: agentId.trim() || undefined,
        evaluation_mode: evalMode,
        max_snapshots: 100,
        repeat_runs: 1,
      };
      if (dataSource === 'recent') {
        payload.snapshot_ids = runSnapshotIds.length ? runSnapshotIds : snapshotIds;
      } else {
        payload.dataset_ids = runDatasetIds.length ? runDatasetIds : datasetIds;
      }
      if (evalMode === 'regression') {
        payload.new_model = newModel.trim() || undefined;
        payload.new_system_prompt = (typeof requestBody.system_prompt === 'string' ? requestBody.system_prompt : requestSystemPrompt).trim() || undefined;
        const temp = requestBody.temperature;
        const maxTok = requestBody.max_tokens;
        const topP = requestBody.top_p;
        if (temp != null && typeof temp === 'number' && Number.isFinite(temp) && temp >= 0) payload.replay_temperature = temp;
        if (maxTok != null && (typeof maxTok === 'number' ? Number.isInteger(maxTok) : Number.isInteger(Number(maxTok))) && Number(maxTok) > 0) payload.replay_max_tokens = Number(maxTok);
        if (topP != null && typeof topP === 'number' && Number.isFinite(topP)) payload.replay_top_p = topP;
        const overrides: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(requestBody)) {
          if (k === 'model' || k === 'system_prompt' || k === 'messages' || k === 'temperature' || k === 'max_tokens' || k === 'top_p') continue;
          overrides[k] = v;
        }
        if (toolsList.length > 0) {
          const built: Array<Record<string, unknown>> = [];
          for (const t of toolsList) {
            const name = t.name.trim();
            if (!name) continue;
            let params: Record<string, unknown> = {};
            if (t.parameters.trim()) {
              try {
                const p = JSON.parse(t.parameters.trim());
                if (p && typeof p === 'object') params = p as Record<string, unknown>;
              } catch {
                setError(`Tool "${name}": parameters must be valid JSON.`);
                setIsValidating(false);
                return;
              }
            }
            built.push({
              type: 'function',
              function: { name, description: t.description.trim() || undefined, ...(Object.keys(params).length ? { parameters: params } : {}) },
            });
          }
          if (built.length) overrides.tools = built;
        } else if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
          overrides.tools = requestBody.tools;
        }
        if (Object.keys(overrides).length) payload.replay_overrides = overrides;
      }

      const res = await releaseGateAPI.validate(projectId, payload);
      setResult(res);
      setError('');
      if (res?.report_id) setLastRunReportId(String(res.report_id));
      mutateHistory();
    } catch (e: any) {
      const msg = typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : (e?.message || 'Release Gate validation failed.');
      setError(Array.isArray(e?.response?.data?.detail) ? e.response.data.detail.join(' ') : msg);
      setResult(null);
    } finally {
      setIsValidating(false);
    }
  };

  const onAgentSelect = (agent: AgentForPicker) => {
    setAgentId(agent.agent_id);
    setSelectedAgent(agent);
    setDatasetIds([]); // Reset datasets on agent change
  };

  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      activeTab="release-gate"
      showTelemetry={false}
      customActions={[]}
    >
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-fuchsia-400" />
              Release Gate
            </h1>
            <p className="text-[13px] text-slate-400 mt-2 max-w-xl leading-relaxed">
              Run automated safety validations on your model changes before deployment.
            </p>
          </div>
          <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
            <button
              onClick={() => setTab('validate')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${tab === 'validate' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
                }`}
            >
              Validate
            </button>
            <button
              onClick={() => setTab('history')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${tab === 'history' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
                }`}
            >
              Runs
            </button>
          </div>
        </div>

        {tab === 'validate' && (
          <>
            <div className="space-y-6">
              {evalMode === 'regression' ? (
                <>
                  {/* Regression: compact mode tabs */}
                  <div className="rounded-2xl border border-white/10 bg-[#111216] p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEvalMode('regression')}
                        title="Baseline eval at capture time; run uses current eval (source of truth)."
                        className="rounded-xl border-2 border-fuchsia-500/60 bg-fuchsia-500/10 px-4 py-2 text-sm font-semibold text-slate-100"
                      >
                        Regression
                      </button>
                      <button type="button" disabled className="rounded-xl border-2 border-white/10 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-500 opacity-60 cursor-not-allowed">
                        Stability
                      </button>
                      <button
                        type="button"
                        onClick={() => setEvalMode('drift')}
                        title="Compare recorded (at capture) vs re-evaluated with current eval config."
                        className="rounded-xl border-2 border-white/10 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-300 hover:border-white/20 hover:bg-white/5 transition-colors"
                      >
                        Drift
                      </button>
                    </div>
                  </div>

                  {/* Hero: Centered Gauge and Configuration */}
                  <div className="flex flex-col items-center gap-10 rounded-3xl border border-white/5 bg-[#111216] p-10 lg:p-14 shadow-2xl relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-fuchsia-500/5 rounded-full blur-[120px] pointer-events-none" />

                    <div className="relative z-10 flex flex-col items-center gap-3">
                      <div className="scale-[1.3] transform origin-top">
                        <PassRateGauge
                          passedRatio={result != null && result.repeat_runs != null ? 1 - (result.failed_run_ratio ?? 0) : null}
                          totalRuns={result?.repeat_runs ?? 0}
                        />
                      </div>
                      {(!result || result.repeat_runs == null) && (
                        <p className="text-slate-400 text-sm font-medium mt-6">Configure target node and press validate</p>
                      )}
                    </div>

                    <div className="w-full max-w-2xl relative z-10">
                      <div className="text-center mb-3">
                        <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Target Configuration</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNodeAndDataModalOpen(true)}
                        disabled={agentsLoading}
                        className="w-full flex items-center justify-between gap-3 rounded-2xl bg-black/60 border border-white/10 px-6 py-4 text-left transition-all hover:border-fuchsia-500/40 hover:bg-white/5 disabled:opacity-50 shadow-inner group"
                        aria-label="Select node and data"
                      >
                        <span className="text-[15px] font-medium truncate text-slate-200 group-hover:text-white transition-colors">
                          {selectedAgent && (dataSource === 'recent' && snapshotIds.length > 0 || datasetIds.length > 0)
                            ? dataSource === 'recent'
                              ? `${selectedAgent.display_name || selectedAgent.agent_id} · ${snapshotIds.length} runs`
                              : datasetIds.length === 1
                                ? (() => {
                                  const d = datasets.find((x: any) => x.id === datasetIds[0]);
                                  const n = Array.isArray(d?.snapshot_ids) ? d.snapshot_ids.length : 0;
                                  return `${selectedAgent.display_name || selectedAgent.agent_id} · ${d?.label || datasetIds[0]} (${n} runs)`;
                                })()
                                : `${selectedAgent.display_name || selectedAgent.agent_id} · ${datasetIds.length} datasets`
                            : 'Select node & data to begin…'}
                        </span>
                        <ChevronDown className="w-5 h-5 text-slate-500 shrink-0 group-hover:text-slate-300 transition-colors" />
                      </button>
                    </div>
                  </div>
                  {projectId && !isNaN(projectId) && (
                    <NodeAndDataPickerModal
                      open={nodeAndDataModalOpen}
                      onClose={() => setNodeAndDataModalOpen(false)}
                      projectId={projectId}
                      agents={agents}
                      agentsLoading={agentsLoading}
                      initialAgent={selectedAgent}
                      initialDataSource={dataSource}
                      initialSnapshotIds={snapshotIds}
                      initialDatasetIds={datasetIds}
                      onConfirm={(selection) => {
                        setAgentId(selection.agent.agent_id);
                        setSelectedAgent(selection.agent);
                        if (selection.dataSource === 'recent') {
                          setDataSource('recent');
                          setSnapshotIds(selection.snapshotIds);
                          setDatasetIds([]);
                        } else {
                          setDataSource('datasets');
                          setDatasetIds(selection.datasetIds);
                          setSnapshotIds([]);
                        }
                      }}
                    />
                  )}

                  {/* 3-column: Baseline data | Config + Run | Result */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Left: Baseline data list (Live View style when recent) */}
                    <div className="rounded-2xl border-2 border-white/10 bg-[#111216] overflow-hidden flex flex-col min-h-[320px]">
                      <div className="px-4 py-3 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
                        Baseline data
                      </div>
                      <div className="flex-1 overflow-y-auto min-h-0">
                        {!selectedAgent ? (
                          <div className="p-6 text-sm text-slate-500 text-center">Select node & data to see baseline.</div>
                        ) : dataSource === 'recent' ? (
                          <>
                            <p className="px-4 py-2 text-xs text-slate-500 border-b border-white/5">
                              Baseline eval is from <strong>snapshot capture time</strong>. Run result uses current eval config.
                            </p>
                            {(() => {
                              const currentVer = (agentEvalData as Record<string, unknown> | undefined)?.current_eval_config_version as string | undefined;
                              const anyStale = currentVer && Array.from(baselineSnapshotsById.values()).some((s) => {
                                const v = (s as Record<string, unknown>)?.eval_config_version as string | undefined;
                                return v && v !== currentVer;
                              });
                              return anyStale ? (
                                <p className="px-4 py-2 text-xs text-amber-500/90 bg-amber-500/5 border-b border-amber-500/20" title="Some baseline snapshots were evaluated with a different eval config. Run result uses current config.">
                                  Eval config has changed since some snapshots were captured — baseline results may differ from Run.
                                </p>
                              ) : null;
                            })()}
                            <div className="px-4 py-2 text-xs text-slate-500 border-b border-white/5">
                              {snapshotIds.length} run{snapshotIds.length !== 1 ? 's' : ''} selected · check to include · click row for detail
                            </div>
                            {recentSnapshots.length === 0 ? (
                              <div className="p-6 text-sm text-slate-500 text-center">Loading selected runs…</div>
                            ) : (
                              <div className="border border-white/[0.06] rounded-b-2xl overflow-hidden bg-[#18191e]">
                                <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-2 px-3 py-2 text-[11px] font-bold text-slate-400 border-b border-white/[0.06]">
                                  <div className="w-6" />
                                  <span>time</span>
                                  <span className="w-20">model</span>
                                  <span className="min-w-0 truncate">prompt / user input</span>
                                  <span className="w-16 text-right">latency</span>
                                </div>
                                {recentSnapshots.map((skinny: { id: string; trace_id?: string; created_at?: string }) => {
                                  const full = baselineSnapshotsById.get(String(skinny.id)) as Record<string, unknown> | undefined;
                                  const snap = (full ?? skinny) as Record<string, unknown>;
                                  const checked = runSnapshotIds.includes(String(skinny.id));
                                  const failed = snapshotEvalFailed(full ?? null);
                                  const timeStr = (snap.created_at ? new Date(String(snap.created_at)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—').split(' ');
                                  const prompt = String(snap.user_message ?? snap.request_prompt ?? '—').slice(0, 60);
                                  const model = String(snap.model ?? '—').split('/').pop() ?? '—';
                                  return (
                                    <div
                                      key={skinny.id}
                                      className={failed ? 'bg-rose-500/[0.06] border-l-2 border-l-rose-500/40' : 'border-l-2 border-l-transparent'}
                                    >
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-2 px-3 py-2.5 items-center text-[13px] hover:bg-white/[0.03] cursor-pointer group"
                                        onClick={() => setBaselineDetailSnapshot(snap as unknown as SnapshotForDetail)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBaselineDetailSnapshot(snap as unknown as SnapshotForDetail); } }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => setRunSnapshotIds((prev) => prev.includes(String(skinny.id)) ? prev.filter((x) => x !== String(skinny.id)) : [...prev, String(skinny.id)])}
                                          onClick={(e) => e.stopPropagation()}
                                          className="rounded border-white/20 text-fuchsia-500 focus:ring-fuchsia-500/50 w-4 h-4"
                                        />
                                        <div className="flex items-baseline gap-1" title={snap.created_at ? new Date(String(snap.created_at)).toLocaleString() : ''}>
                                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-500 group-hover:bg-slate-400" style={failed ? { backgroundColor: 'rgba(244,63,94,0.8)' } : {}} />
                                          <span className="font-mono text-slate-300">{timeStr[0] ?? '—'}</span>
                                          <span className="text-[11px] text-slate-500 uppercase">{timeStr[1] ?? ''}</span>
                                        </div>
                                        <span className="text-slate-200 truncate w-20" title={String(snap.model ?? '')}>{model}</span>
                                        <div className="min-w-0 flex items-center gap-2">
                                          <span title="Evaluated when this snapshot was captured (not current eval config)." className={failed ? 'px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[11px] font-bold uppercase' : 'px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[11px] font-bold uppercase'}>
                                            {failed ? 'FAIL' : 'PASS'}
                                          </span>
                                          <span className="text-slate-400 truncate">{prompt}{prompt.length >= 60 ? '…' : ''}</span>
                                        </div>
                                        <span className="text-slate-400 text-right font-mono text-xs">{snap.latency_ms != null ? `${Number(snap.latency_ms)}ms` : '—'}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        ) : datasetIds.length === 0 ? (
                          <div className="p-6 text-sm text-slate-500 text-center">Select a dataset to see baseline.</div>
                        ) : (
                          <ul className="divide-y divide-white/5">
                            {datasetIds.map((id) => {
                              const d = datasets.find((x: { id: string }) => x.id === id);
                              const label = d?.label || id;
                              const count = Array.isArray(d?.snapshot_ids) ? d.snapshot_ids.length : 0;
                              const checked = runDatasetIds.includes(id);
                              return (
                                <li key={id}>
                                  <label className="flex items-start gap-2 px-4 py-3 cursor-pointer hover:bg-white/5">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => setRunDatasetIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                                      className="mt-1 rounded border-white/20 text-fuchsia-500 focus:ring-fuchsia-500/50"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium text-slate-200 truncate block">{label}</span>
                                      <span className="text-xs text-slate-500">{count} run{count !== 1 ? 's' : ''}</span>
                                    </div>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Center: Config + Run */}
                    <div className="flex flex-col gap-6">
                      <div className="rounded-2xl border border-white/5 bg-black/20 p-5 space-y-4 shadow-inner">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                          <Activity className="w-4 h-4 text-emerald-500/70" />
                          <span className="text-xs font-bold uppercase tracking-widest text-emerald-500/80">Baseline Data</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 text-xs">
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase tracking-widest font-semibold mb-1">Agent Name</span>
                            <span className="text-slate-200 font-medium">{selectedAgent?.display_name || selectedAgent?.agent_id || agentId || 'Not selected'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase tracking-widest font-semibold mb-1">Node Model (Live View latest)</span>
                            <span className="text-slate-200 font-mono text-[11px] bg-white/5 px-2 py-1 rounded">{runDataModel || '(no recent live snapshot)'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase tracking-widest font-semibold mb-1">Node Prompt (Live View latest)</span>
                            <div className="text-slate-300 leading-relaxed max-h-24 overflow-y-auto custom-scrollbar bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-[11px] whitespace-pre-wrap">
                              {runDataPrompt || '(no recent live snapshot)'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase tracking-widest font-semibold mb-2">Active Checks (Current Policy)</span>
                            {runEvalElements.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2">
                                {runEvalElements.map(({ name, value }) => {
                                  const displayVal = formatEvalSetting(value);

                                  return (
                                    <div key={name} className="flex flex-col gap-1 p-2 rounded-lg bg-white/5 border border-white/5 relative overflow-hidden">
                                      {/* Read-only indicator */}
                                      <div className="absolute top-1 right-1 opacity-20">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                      </div>
                                      
                                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide truncate pr-3">
                                        {LIVE_VIEW_CHECK_LABELS[name] || name.replace(/_/g, ' ')}
                                      </span>
                                      
                                      <div className="flex items-center justify-between gap-2 mt-auto">
                                        <span className="text-xs font-mono text-fuchsia-300 break-all">{displayVal}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">No active checks found.</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-4 mb-2">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Candidate Overrides</div>
                        <div className="h-px bg-white/10 flex-1"></div>
                      </div>

                      <div className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">Model (required)</span>
                        <ModelSelector value={newModel} onChange={setNewModel} />
                        <p className="text-[10px] text-slate-500">Model is set here only; it is not part of the request JSON below.</p>
                      </div>
                      <div className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">System prompt</span>
                        <textarea
                          value={requestSystemPrompt}
                          onChange={(e) => setRequestBody((prev) => applySystemPromptToBody(prev, e.target.value))}
                          rows={3}
                          placeholder="From baseline or edit here; syncs with JSON below"
                          className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none resize-none"
                        />
                        <p className="text-[10px] text-slate-500">Edits here update the Request JSON; editing JSON updates this field.</p>
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setOverridesOpen((o) => !o)}
                          className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500 hover:text-slate-400 transition-colors"
                          aria-expanded={overridesOpen}
                        >
                          {overridesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          Request JSON (no model) + tools
                        </button>
                        {overridesOpen && (
                          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                            <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Request JSON</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500">
                                    {baselineSeedSnapshot ? `From Snapshot #${String(baselineSeedSnapshot.id ?? '')} (model excluded)` : 'No run selected'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleResetRequestJson}
                                    disabled={!baselinePayload}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <RefreshCcw className="w-3 h-3" aria-hidden />
                                    Reset
                                  </button>
                                </div>
                              </div>
                              <textarea
                                value={requestJsonDraft ?? JSON.stringify(requestBody, null, 2)}
                                onChange={(e) => {
                                  setRequestJsonDraft(e.target.value);
                                  setRequestJsonError('');
                                }}
                                onBlur={handleRequestJsonBlur}
                                onFocus={() => setRequestJsonDraft(requestJsonDraft ?? JSON.stringify(requestBody, null, 2))}
                                rows={8}
                                placeholder='{"system_prompt": "...", "temperature": 0.2, ...}'
                                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11px] font-mono text-slate-300 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none resize-y"
                              />
                              {requestJsonError && <p className="text-[10px] text-rose-400">{requestJsonError}</p>}
                              <p className="text-[10px] text-slate-500">Editable. Model is set above only. Blur to apply JSON changes. Use Reset to restore baseline.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="block space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Temperature (optional)</span>
                                <input
                                  value={temperatureDraft ?? (requestBody.temperature != null ? String(requestBody.temperature) : '')}
                                  onChange={(e) => setTemperatureDraft(e.target.value)}
                                  onBlur={() => {
                                    const v = (temperatureDraft ?? (requestBody.temperature != null ? String(requestBody.temperature) : '')).trim();
                                    const n = v === '' ? undefined : parseFloat(v);
                                    setRequestBody((prev) => ({ ...prev, temperature: n !== undefined && Number.isFinite(n) ? (n as unknown) : undefined }));
                                    setTemperatureDraft(null);
                                  }}
                                  placeholder="e.g. 0.2"
                                  inputMode="decimal"
                                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none"
                                />
                              </div>
                              <div className="block space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Max tokens (optional)</span>
                                <input
                                  value={maxTokensDraft ?? (requestBody.max_tokens != null ? String(requestBody.max_tokens) : '')}
                                  onChange={(e) => setMaxTokensDraft(e.target.value)}
                                  onBlur={() => {
                                    const v = (maxTokensDraft ?? (requestBody.max_tokens != null ? String(requestBody.max_tokens) : '')).trim();
                                    const n = v === '' ? undefined : parseInt(v, 10);
                                    setRequestBody((prev) => ({ ...prev, max_tokens: n !== undefined && Number.isFinite(n) && n > 0 ? (n as unknown) : undefined }));
                                    setMaxTokensDraft(null);
                                  }}
                                  placeholder="e.g. 1024"
                                  inputMode="numeric"
                                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Tools (editable list)</span>
                                <div className="flex items-center gap-1">
                                  <input type="file" accept=".json,application/json" className="hidden" id="tools-upload-main-1" onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      try {
                                        const parsed = JSON.parse(reader.result as string);
                                        const arr = Array.isArray(parsed) ? parsed : (parsed?.tools ? parsed.tools : []);
                                        const next = (Array.isArray(arr) ? arr : []).map((item: any) => ({ id: crypto.randomUUID(), name: item?.function?.name ?? item?.name ?? '', description: typeof item?.function?.description === 'string' ? item.function.description : (item?.description ?? ''), parameters: typeof item?.function?.parameters === 'object' ? JSON.stringify(item.function.parameters, null, 2) : (item?.parameters ? JSON.stringify(item.parameters) : '') })).filter((t: { name: string }) => t.name);
                                        setToolsList((prev) => [...prev, ...next]);
                                      } catch { setError('Uploaded file must be valid JSON.'); }
                                      e.target.value = '';
                                    };
                                    reader.readAsText(f);
                                  }} />
                                  <label htmlFor="tools-upload-main-1" className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 cursor-pointer"><Upload className="w-3 h-3" /> Upload</label>
                                  <button type="button" onClick={() => setToolsList((prev) => [...prev, { id: crypto.randomUUID(), name: '', description: '', parameters: '{}' }])} className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10"><Plus className="w-3 h-3" /> Add</button>
                                  <button
                                    type="button"
                                    onClick={() => setToolsList(baselineTools)}
                                    disabled={!baselinePayload}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Reset baseline
                                  </button>
                                </div>
                              </div>
                              {toolsList.length === 0 ? <p className="text-[10px] text-slate-500">No tools loaded. Add manually, upload JSON, or reset to baseline.</p> : (
                                <ul className="space-y-2 max-h-40 overflow-y-auto">
                                  {toolsList.map((t) => (
                                    <li key={t.id} className="rounded-lg border border-white/10 bg-black/30 p-2 space-y-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <input value={t.name} onChange={(e) => setToolsList((prev) => prev.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="flex-1 min-w-0 rounded bg-black/40 border border-white/10 px-2 py-1 text-xs text-slate-200" />
                                        <button type="button" onClick={() => setToolsList((prev) => prev.filter((x) => x.id !== t.id))} className="p-1 text-slate-500 hover:text-rose-400" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </div>
                                      <input value={t.description} onChange={(e) => setToolsList((prev) => prev.map((x) => (x.id === t.id ? { ...x, description: e.target.value } : x)))} placeholder="Description (optional)" className="w-full rounded bg-black/40 border border-white/10 px-2 py-1 text-xs text-slate-200" />
                                      <textarea value={t.parameters} onChange={(e) => setToolsList((prev) => prev.map((x) => (x.id === t.id ? { ...x, parameters: e.target.value } : x)))} placeholder="{}" rows={1} className="w-full rounded bg-black/40 border border-white/10 px-2 py-1 text-[10px] font-mono text-slate-200 resize-y" />
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {error && (
                        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                          <span>{error}</span>
                        </div>
                      )}
                      <div className="mt-auto pt-4">
                        <button
                          onClick={handleValidate}
                          disabled={!canValidate || isValidating}
                          title={!canValidate ? 'Select an agent and a dataset to validate' : undefined}
                          className="w-full justify-center inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {isValidating ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                              Running…
                            </>
                          ) : (
                            <>
                              <Flag className="w-5 h-5 fill-white/20" aria-hidden />
                              Run
                            </>
                          )}
                        </button>
                        {!canValidate && !isValidating && (
                          <p className="text-xs text-center text-slate-500 mt-2">Select agent and dataset to run.</p>
                        )}
                      </div>
                    </div>

                    {/* Right: Result list */}
                    <div className="rounded-2xl border-2 border-white/10 bg-[#111216] overflow-hidden flex flex-col min-h-[320px]">
                      <div className="px-4 py-3 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
                        Result
                      </div>
                      <div className="flex-1 overflow-y-auto min-h-0 p-4">
                        {!result ? (
                          <div className="flex flex-col items-center justify-center h-full text-center py-8 opacity-60">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3">
                              <Activity className="w-8 h-8 text-slate-600" />
                            </div>
                            <p className="text-sm font-medium text-slate-400">Ready to validate</p>
                            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">Configure your regression test and click Run to see results here.</p>
                          </div>
                        ) : (result.run_results?.length ?? result.drift_runs?.length ?? 0) > 0 ? (
                          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-[#18191e]">
                            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 px-3 py-2 text-[11px] font-bold text-slate-400 border-b border-white/[0.06]">
                              <span>run</span>
                              <span className="w-14 text-center">eval</span>
                              <span className="min-w-0 truncate">summary</span>
                              <span className="w-16 text-right">latency</span>
                            </div>
                            {(result.run_results ?? result.drift_runs ?? []).map((run: any, idx: number) => {
                              const isSelected = selectedDriftRunIndex === idx;
                              const failed = !run.pass;
                              const replay = run.replay ?? {};
                              const avgLatency = replay.avg_latency_ms;
                              const summaryStr = (run.failure_reasons ?? [])[0] ?? (run.eval_elements_failed?.length ? `Failed: ${run.eval_elements_failed.length} eval` : run.pass ? 'Passed' : '—');
                              return (
                                <div
                                  key={run.trace_id ?? run.run_index ?? idx}
                                  className={failed ? 'bg-rose-500/[0.06] border-l-2 border-l-rose-500/40' : 'border-l-2 border-l-emerald-500/40 bg-emerald-500/[0.03]'}
                                >
                                  <button
                                    type="button"
                                    className="w-full text-left grid grid-cols-[1fr_auto_1fr_auto] gap-2 px-3 py-2.5 items-center text-[13px] hover:bg-white/[0.03] transition-colors"
                                    onClick={() => setSelectedDriftRunIndex(isSelected ? null : idx)}
                                  >
                                    <div className="flex items-baseline gap-1 min-w-0">
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={failed ? { backgroundColor: 'rgba(244,63,94,0.8)' } : { backgroundColor: 'rgba(16,185,129,0.8)' }} />
                                      <span className="font-medium text-slate-200">Run {run.run_index ?? idx + 1}</span>
                                      {run.trace_id && <span className="text-slate-500 text-xs truncate">· {String(run.trace_id).slice(0, 8)}…</span>}
                                    </div>
                                    <span className={failed ? 'px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[11px] font-bold uppercase' : 'px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[11px] font-bold uppercase'}>
                                      {failed ? 'FAIL' : 'PASS'}
                                    </span>
                                    <span className="text-slate-400 truncate text-xs">{summaryStr}</span>
                                    <span className="text-slate-400 text-right font-mono text-xs">{avgLatency != null ? `${Math.round(Number(avgLatency))}ms` : '—'}</span>
                                  </button>
                                  {isSelected && (
                                    <div className="px-3 pb-3 pt-0 border-t border-white/5 space-y-2">
                                      {(run.eval_elements_passed?.length > 0 || run.eval_elements_failed?.length > 0) && (
                                        <div className="text-xs text-slate-500">
                                          Passed: {run.eval_elements_passed?.length ?? 0} · Failed: {run.eval_elements_failed?.length ?? 0}
                                        </div>
                                      )}
                                      {(run.has_tool_calls || (run.tool_calls_summary?.length ?? 0) > 0) && (
                                        <div className="text-xs text-amber-400/80">
                                          Tools: {(run.tool_calls_summary ?? []).map((t: { name?: string }) => t.name).filter(Boolean).join(', ') || (run.tool_calls_summary ?? []).length}
                                        </div>
                                      )}
                                      {(run.eval_elements_failed ?? []).length > 0 && (
                                        <ul className="text-xs text-rose-200/90 space-y-0.5">
                                          {(run.eval_elements_failed ?? []).map((e: any, i: number) => (
                                            <li key={e.rule_id ?? i}>· {e.rule_name || e.rule_id}</li>
                                          ))}
                                        </ul>
                                      )}
                                      {(run.violations ?? []).length > 0 && (
                                        <ul className="text-xs text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">
                                          {(run.violations ?? []).slice(0, 5).map((v: any, i: number) => (
                                            <li key={i}>· {v.message ?? v.rule_name ?? v.rule_id}</li>
                                          ))}
                                          {(run.violations?.length ?? 0) > 5 && <li className="text-slate-500">… +{(run.violations?.length ?? 0) - 5} more</li>}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No run details in this result.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start max-w-[1600px] mx-auto">
                  <div className="space-y-6 rounded-3xl border border-white/5 bg-[#111216] shadow-xl p-7">
                    {/* Step 1: Select agent (Live View node) */}
                    <div className="space-y-3">
                      <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 select-none">1. Select configuration</span>
                      <button
                        type="button"
                        onClick={() => setAgentSelectModalOpen(true)}
                        disabled={agentsLoading}
                        className="w-full group flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-left transition-all hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Select agent"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${selectedAgent ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-slate-500'}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-medium truncate ${selectedAgent ? 'text-slate-200' : 'text-slate-500'}`}>
                              {selectedAgent ? (selectedAgent.display_name || selectedAgent.agent_id) : 'Select agent...'}
                            </div>
                            {selectedAgent && (
                              <div className="text-xs text-slate-500 truncate font-mono mt-0.5">
                                {selectedAgent.model || 'Unknown model'}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                      </button>
                      {!agentsLoading && agents.length === 0 && (
                        <p className="text-xs text-slate-500 mt-2">Run flows in Live View to see agents here.</p>
                      )}
                    </div>

                    {/* Step 2: Select dataset */}
                    <div className="space-y-3">
                      <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 select-none">2. Select dataset</span>
                      <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 block hidden">Saved dataset</span>

                      <button
                        type="button"
                        onClick={() => setDatasetSelectModalOpen(true)}
                        disabled={datasetsLoading || !agentId?.trim()}
                        className="w-full group flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-left transition-all hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Select dataset"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${datasetIds.length > 0 ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400' : 'border-white/10 bg-white/5 text-slate-500'}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            {(() => {
                              if (datasetIds.length === 0) {
                                return <div className="text-sm font-medium text-slate-500">Select dataset...</div>;
                              }
                              if (datasetIds.length === 1) {
                                const selectedDataset = datasets.find((d: any) => d.id === datasetIds[0]);
                                if (!selectedDataset) return <div className="text-sm font-medium text-slate-200">{datasetIds[0]}</div>;
                                const count = Array.isArray(selectedDataset.snapshot_ids) ? selectedDataset.snapshot_ids.length : 0;
                                return (
                                  <>
                                    <div className="text-sm font-medium text-slate-200 truncate">
                                      {selectedDataset.label || selectedDataset.id}
                                      <span className="ml-2 inline-flex items-center rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-inset ring-white/10">
                                        {count} runs
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-500 truncate mt-0.5">
                                      {selectedDataset.created_at ? new Date(selectedDataset.created_at).toLocaleString() : 'Unknown date'}
                                    </div>
                                  </>
                                );
                              }
                              // Multiple
                              return (
                                <>
                                  <div className="text-sm font-medium text-slate-200 truncate">
                                    {datasetIds.length} datasets selected
                                  </div>
                                  <div className="text-xs text-slate-500 truncate mt-0.5">
                                    Click to view or edit selection
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                      </button>

                      {!agentId?.trim() && (
                        <p className="text-xs text-slate-500 mt-2">Select an agent in step 2 first.</p>
                      )}
                      {agentId?.trim() && !datasetsLoading && datasets.length === 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-slate-500/70">Save a dataset from Live View (DATA tab) for this agent.</p>
                          <Link
                            href={`/organizations/${orgId}/projects/${projectId}/live-view`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden /> Go to Live View
                          </Link>
                        </div>
                      )}
                      {evalMode === 'drift' && agentId?.trim() && (
                        <p className="text-xs text-slate-400 mt-2">Current behavior rules will be applied to the selected run&apos;s recorded data.</p>
                      )}
                    </div>

                    {/* Layout by mode: Regression = two boxes, Drift = two boxes, Stability = one box */}
                    {(evalMode as EvalMode) === 'regression' && (
                      <div className="space-y-3 pt-2">
                        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 select-none">Baseline vs Candidate</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="rounded-2xl border-2 border-white/10 bg-white/[0.02] p-5 min-h-[200px] flex flex-col">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Baseline</div>
                            <p className="text-slate-500 text-xs mb-3">Current model and system prompt for this agent (from recorded run).</p>
                            <div className="space-y-2 text-sm flex-1">
                              <div>
                                <span className="text-slate-500 block text-[10px] uppercase tracking-wide">Model</span>
                                <span className="text-slate-300 font-medium">Original</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px] uppercase tracking-wide">System prompt</span>
                                <span className="text-slate-400 text-xs italic">(from recorded run)</span>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-2xl border-2 border-fuchsia-500/30 bg-fuchsia-500/5 p-5 min-h-[200px] flex flex-col">
                            <div className="text-xs font-bold uppercase tracking-wider text-fuchsia-400 mb-3">Candidate</div>
                            <p className="text-slate-500 text-xs mb-3">New model or prompt to test against the baseline.</p>
                            <div className="space-y-3 flex-1">
                              <label className="block space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Model</span>
                                <input
                                  value={newModel}
                                  onChange={(e) => setNewModel(e.target.value)}
                                  placeholder="e.g. gpt-4o (leave empty = original)"
                                  list="release-gate-models-2"
                                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none transition-colors"
                                />
                                <datalist id="release-gate-models-2">
                                  <option value="gpt-4o-mini">GPT-4o Mini (fast &amp; cheap)</option>
                                  <option value="gpt-4o">GPT-4o (high precision)</option>
                                  <option value="o1-preview">o1-preview (reasoning)</option>
                                </datalist>
                              </label>
                              <label className="block space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">System prompt</span>
                                <textarea
                                  value={requestSystemPrompt}
                                  onChange={(e) => setRequestBody((prev) => applySystemPromptToBody(prev, e.target.value))}
                                  rows={2}
                                  placeholder="From baseline or edit here; syncs with Request JSON"
                                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none transition-colors resize-none"
                                />
                              </label>
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => setOverridesOpen((o) => !o)}
                                  className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500 hover:text-slate-400 transition-colors"
                                  aria-expanded={overridesOpen}
                                >
                                  {overridesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  Tools &amp; Request JSON (optional)
                                </button>
                                {overridesOpen && (
                                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] uppercase tracking-wide text-slate-500">Tools (form)</span>
                                        <div className="flex items-center gap-1">
                                          <input type="file" accept=".json,application/json" className="hidden" id="tools-upload-main-2" onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            const reader = new FileReader();
                                            reader.onload = () => {
                                              try {
                                                const parsed = JSON.parse(reader.result as string);
                                                const arr = Array.isArray(parsed) ? parsed : (parsed?.tools ? parsed.tools : []);
                                                const next = (Array.isArray(arr) ? arr : []).map((item: any) => ({ id: crypto.randomUUID(), name: item?.function?.name ?? item?.name ?? '', description: typeof item?.function?.description === 'string' ? item.function.description : (item?.description ?? ''), parameters: typeof item?.function?.parameters === 'object' ? JSON.stringify(item.function.parameters, null, 2) : (item?.parameters ? JSON.stringify(item.parameters) : '') })).filter((t: { name: string }) => t.name);
                                                setToolsList((prev) => [...prev, ...next]);
                                              } catch { setError('Uploaded file must be valid JSON.'); }
                                              e.target.value = '';
                                            };
                                            reader.readAsText(f);
                                          }} />
                                          <label htmlFor="tools-upload-main-2" className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 cursor-pointer"><Upload className="w-3 h-3" /> Upload</label>
                                          <button type="button" onClick={() => setToolsList((prev) => [...prev, { id: crypto.randomUUID(), name: '', description: '', parameters: '{}' }])} className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10"><Plus className="w-3 h-3" /> Add</button>
                                        </div>
                                      </div>
                                      {toolsList.length === 0 ? <p className="text-[10px] text-slate-500">No tools. Add or upload JSON.</p> : (
                                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                                          {toolsList.map((t) => (
                                            <li key={t.id} className="rounded-lg border border-white/10 bg-black/30 p-2 space-y-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <input value={t.name} onChange={(e) => setToolsList((prev) => prev.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="flex-1 min-w-0 rounded bg-black/40 border border-white/10 px-2 py-1 text-xs text-slate-200" />
                                                <button type="button" onClick={() => setToolsList((prev) => prev.filter((x) => x.id !== t.id))} className="p-1 text-slate-500 hover:text-rose-400" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                                              </div>
                                              <input value={t.description} onChange={(e) => setToolsList((prev) => prev.map((x) => (x.id === t.id ? { ...x, description: e.target.value } : x)))} placeholder="Description (optional)" className="w-full rounded bg-black/40 border border-white/10 px-2 py-1 text-xs text-slate-200" />
                                              <textarea value={t.parameters} onChange={(e) => setToolsList((prev) => prev.map((x) => (x.id === t.id ? { ...x, parameters: e.target.value } : x)))} placeholder="{}" rows={1} className="w-full rounded bg-black/40 border border-white/10 px-2 py-1 text-[10px] font-mono text-slate-200 resize-y" />
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    <div className="block space-y-1">
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="text-[10px] uppercase tracking-wide text-slate-500">Request JSON (no model)</span>
                                        <button
                                          type="button"
                                          onClick={handleResetRequestJson}
                                          disabled={!baselinePayload}
                                          className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          <RefreshCcw className="w-3 h-3" aria-hidden />
                                          Reset
                                        </button>
                                      </div>
                                      <textarea
                                        value={requestJsonDraft ?? JSON.stringify(requestBody, null, 2)}
                                        onChange={(e) => { setRequestJsonDraft(e.target.value); setRequestJsonError(''); }}
                                        onBlur={handleRequestJsonBlur}
                                        onFocus={() => setRequestJsonDraft(requestJsonDraft ?? JSON.stringify(requestBody, null, 2))}
                                        rows={4}
                                        placeholder='{"system_prompt": "...", "temperature": 0.2, ...}'
                                        className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none resize-y font-mono"
                                      />
                                      {requestJsonError && <p className="text-[10px] text-rose-400">{requestJsonError}</p>}
                                      <p className="text-[10px] text-slate-500">Blur to apply. Reset restores baseline.</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {evalMode === 'stability' && (
                      <div className="pt-2">
                        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 select-none block mb-3">Stability</span>
                        <div className="rounded-2xl border-2 border-white/10 bg-white/[0.02] p-8 min-h-[200px] flex items-center justify-center">
                          <p className="text-slate-500 text-center">
                            <span className="font-semibold text-slate-400">Stability – Same input, N runs</span>
                            <span className="block mt-2 text-sm">Coming soon</span>
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setAdvancedOpen((o) => !o)}
                        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                        aria-expanded={advancedOpen}
                      >
                        {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        Advanced options &amp; Thresholds
                      </button>
                    </div>

                    {advancedOpen && (
                      <div className="bg-black/20 rounded-2xl p-5 border border-white/5 space-y-6 mt-4">
                        <div className="pt-5 border-t border-white/5 space-y-4">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Evaluation</h4>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Result shows Pass Rate (Safe ≥ 75%). No threshold to set — just run and read the color. You can open any run for details.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setCriteriaOpen((o) => !o)}
                            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                            aria-expanded={criteriaOpen}
                          >
                            {criteriaOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            How is this evaluated?
                          </button>
                          {criteriaOpen && (
                            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-slate-400 space-y-2">
                              <p><strong className="text-slate-300">Run:</strong> Each trace or replay is one run.</p>
                              <p><strong className="text-slate-300">Failed run:</strong> A run is failed if it has at least one eval element that did not pass (same as Live View: any failure turns the run red).</p>
                              <p><strong className="text-slate-300">Pass Rate:</strong> Percentage of runs with NO failures.</p>
                              <p><strong className="text-slate-300">Color Band:</strong> 75–100% = Green (Safe), 50–75% = Yellow (Warning), 25–50% = Orange (High Risk), 0–25% = Red (Critical).</p>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 pt-2 border-t border-white/5 mt-2">You can run this check from CI using the release-gate webhook or validate API.</p>
                      </div>
                    )}

                    <div className="pt-6 border-t border-white/5 space-y-4">
                      {error && (
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                          <span>{error}</span>
                        </div>
                      )}
                      <div>
                        <button
                          onClick={handleValidate}
                          disabled={!canValidate || isValidating}
                          title={!canValidate ? 'Select an agent and a dataset to validate' : undefined}
                          className="w-full justify-center inline-flex items-center gap-2.5 rounded-xl bg-slate-100 hover:bg-white px-6 py-4 text-[15px] font-bold text-slate-900 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.01] active:scale-[0.99]"
                        >
                          {isValidating ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                              Running…
                            </>
                          ) : (
                            <>
                              <Flag className="w-5 h-5 fill-slate-900/20" aria-hidden />
                              Validate Configuration
                            </>
                          )}
                        </button>
                        {!canValidate && !isValidating && (
                          <p className="text-xs text-center text-slate-500 mt-2.5">
                            Select an agent and a dataset above to continue.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col rounded-3xl border border-white/5 bg-[#111216] shadow-xl p-8 sticky top-4 h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar">
                    <div className="flex-1 flex flex-col w-full">
                      <div className="flex items-center justify-between mb-8">
                        <h3 className="text-sm uppercase tracking-widest font-bold text-slate-400 select-none">Result Analysis</h3>
                      </div>

                      {!result ? (
                        <div className="flex flex-col items-center justify-center flex-1 opacity-80 pb-12">
                          <div className="w-40 h-40 rounded-full border-[6px] border-white/5 bg-gradient-to-b from-white/5 to-transparent flex items-center justify-center mb-8 relative shadow-2xl">
                            <div className="absolute inset-0 rounded-full border border-white/5 animate-pulse" />
                            <span className="text-2xl font-black text-slate-500 tracking-widest uppercase">Ready</span>
                          </div>
                          <p className="text-base font-medium text-slate-400">Configure & Press Validate</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {(() => {
                            const failedRatio = result.failed_run_ratio ?? (result.pass ? 0 : 1);
                            const passRatio = 1 - failedRatio;
                            const percentage = Math.round(passRatio * 100);

                            let gradient = 'from-emerald-400 to-teal-500';
                            let shadow = 'shadow-emerald-500/20';
                            let text = 'text-emerald-400';
                            let label = 'Safe to Deploy';
                            let sub = 'Excellent pass rate';

                            if (percentage < 25) {
                              gradient = 'from-rose-500 to-pink-600';
                              shadow = 'shadow-rose-500/20';
                              text = 'text-rose-400';
                              label = 'Critical Failure';
                              sub = 'Most checks failed';
                            } else if (percentage < 50) {
                              gradient = 'from-orange-400 to-red-400';
                              shadow = 'shadow-orange-500/20';
                              text = 'text-orange-400';
                              label = 'High Risk';
                              sub = 'Significant failures';
                            } else if (percentage < 75) {
                              gradient = 'from-yellow-400 to-amber-500';
                              shadow = 'shadow-yellow-500/20';
                              text = 'text-yellow-400';
                              label = 'Warning';
                              sub = 'Moderate failures';
                            }

                            return (
                              <div className="flex flex-col items-center justify-center flex-1 py-8">
                                <div className={`relative w-64 h-64 rounded-full p-[8px] bg-gradient-to-br ${gradient} shadow-[0_0_60px_-15px_rgba(0,0,0,0.5)] ${shadow} mb-8`}>
                                  <div className="w-full h-full rounded-full bg-[#15161A] flex flex-col items-center justify-center relative overflow-hidden">
                                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10`} />
                                    <span className={`text-6xl font-black ${text} tracking-tighter`}>{percentage}%</span>
                                    <span className="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Passed</span>
                                  </div>
                                </div>
                                <div className="text-center space-y-2">
                                  <h4 className={`text-2xl font-bold ${text}`}>{label}</h4>
                                  <p className="text-base text-slate-400">{sub}</p>
                                  {result.repeat_runs != null && (
                                    <p className="text-sm text-slate-500 mt-2">{result.repeat_runs} runs executed</p>
                                  )}
                                </div>
                                {result.summary && (
                                  <p className="text-sm text-slate-300 mt-6 text-center max-w-sm leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                                    {result.summary}
                                  </p>
                                )}
                              </div>
                            );
                          })()}

                          {/* Drift: list of runs with passed/failed eval elements; click for detail */}
                          {(result.drift_runs?.length ?? result.run_results?.some((r: any) => r.eval_elements_passed != null)) ? (
                            <div className="space-y-3">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Runs (new eval applied)</p>
                              <div className="space-y-2">
                                {(result.drift_runs ?? result.run_results ?? []).map((run: any, idx: number) => {
                                  const passed = run.eval_elements_passed ?? [];
                                  const failed = run.eval_elements_failed ?? [];
                                  const isSelected = selectedDriftRunIndex === idx;
                                  return (
                                    <button
                                      key={run.trace_id ?? run.run_index ?? idx}
                                      type="button"
                                      onClick={() => setSelectedDriftRunIndex(isSelected ? null : idx)}
                                      className={`w-full text-left rounded-xl border-2 p-3 transition-colors ${isSelected ? 'border-fuchsia-500/50 bg-fuchsia-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5'}`}
                                    >
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-slate-200">
                                          Run {run.run_index ?? idx + 1}
                                          {run.trace_id && <span className="text-slate-500 font-normal ml-2 truncate">· {run.trace_id}</span>}
                                        </span>
                                        {run.pass ? (
                                          <span className="text-xs font-medium text-emerald-400">Passed</span>
                                        ) : (
                                          <span className="text-xs font-medium text-rose-400">Failed</span>
                                        )}
                                      </div>
                                      <div className="text-xs text-slate-500 mt-1">
                                        Passed: {passed.length} · Failed: {failed.length}
                                        {(run.has_tool_calls || (run.tool_calls_summary?.length ?? 0) > 0) && (
                                          <span className="text-amber-400/80 ml-1">
                                            · Tools: {(run.tool_calls_summary ?? []).map((t: { name?: string }) => t.name).filter(Boolean).join(', ') || (run.tool_calls_summary ?? []).length}
                                          </span>
                                        )}
                                      </div>
                                      {isSelected && (
                                        <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                                          {passed.length > 0 && (
                                            <div>
                                              <p className="text-[10px] uppercase tracking-wider text-emerald-500/80 mb-1">Passed eval elements</p>
                                              <ul className="text-xs text-slate-300 space-y-0.5">
                                                {passed.map((e: { rule_id: string; rule_name: string }, i: number) => (
                                                  <li key={e.rule_id ?? i}>· {e.rule_name || e.rule_id}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                          {failed.length > 0 && (
                                            <div>
                                              <p className="text-[10px] uppercase tracking-wider text-rose-500/80 mb-1">Failed eval elements</p>
                                              <ul className="text-xs text-rose-200/90 space-y-0.5">
                                                {failed.map((e: { rule_id: string; rule_name: string; violation_count?: number }, i: number) => (
                                                  <li key={e.rule_id ?? i}>· {e.rule_name || e.rule_id} {e.violation_count != null ? `(${e.violation_count})` : ''}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                          {(run.violations?.length ?? 0) > 0 && (
                                            <div>
                                              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Violations</p>
                                              <ul className="text-xs text-slate-400 space-y-0.5 max-h-32 overflow-y-auto">
                                                {run.violations.slice(0, 10).map((v: any, i: number) => (
                                                  <li key={i}>· {v.message ?? v.rule_name ?? v.rule_id}</li>
                                                ))}
                                                {(run.violations?.length ?? 0) > 10 && (
                                                  <li className="text-slate-500">… and {(run.violations?.length ?? 0) - 10} more</li>
                                                )}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-[11px] text-slate-500">Click a run to see passed/failed eval elements and violations.</p>
                            </div>
                          ) : null}

                          {!result.pass && (
                            <div className="rounded-lg border border-slate-500/20 bg-white/5 px-3 py-2">
                              <p className="text-xs font-semibold text-slate-300 mb-1">Next steps</p>
                              <ul className="text-xs text-slate-400 space-y-1">
                                <li>• Review runs below or adjust rules in Live View, or</li>
                                <li>
                                  • <Link href={`/organizations/${orgId}/projects/${projectId}/live-view`} className="text-fuchsia-400 hover:underline">Review rules in Live View</Link>
                                </li>
                              </ul>
                            </div>
                          )}

                          {!result.pass && (result.failed_signals?.length ?? 0) > 0 && (
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                              <p className="text-xs font-semibold text-rose-300 mb-1">Failed rules</p>
                              <ul className="text-xs text-rose-200/90 space-y-0.5">
                                {result.failed_signals!.slice(0, 10).map((ruleId, idx) => (
                                  <li key={idx}>• {ruleId}</li>
                                ))}
                                {(result.failed_signals?.length ?? 0) > 10 && (
                                  <li className="text-slate-400">… and {(result.failed_signals?.length ?? 0) - 10} more</li>
                                )}
                              </ul>
                            </div>
                          )}

                          {!result.pass && (result.failure_reasons?.length || 0) > 0 && (
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                              <p className="text-xs font-semibold text-rose-300 mb-1">Reasons</p>
                              <ul className="space-y-0.5">
                                {result.failure_reasons.map((reason, idx) => (
                                  <li key={idx} className="text-xs text-rose-200/90">• {reason}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {(result.evidence_pack?.top_regressed_rules?.length || 0) > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-1">Top regressed rules</p>
                              <ul className="space-y-0.5">
                                {result.evidence_pack.top_regressed_rules.slice(0, 5).map((row: any, idx: number) => (
                                  <li key={idx} className="text-xs text-slate-300">
                                    {row.rule_name || row.rule_id}: +{row.delta}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setResultDetailsOpen((o) => !o)}
                            className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
                            aria-expanded={resultDetailsOpen}
                          >
                            {resultDetailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            Details (report_id, trace_id, etc.)
                          </button>
                          {resultDetailsOpen && (
                            <div className="text-xs text-slate-500 space-y-1 font-mono rounded-lg bg-black/30 px-3 py-2 border border-white/5">
                              <div>report_id: {result.report_id}</div>
                              <div>trace_id: {result.trace_id}</div>
                              <div>baseline_trace_id: {result.baseline_trace_id}</div>
                              <div>repeat_runs: {result.repeat_runs}</div>
                              <div>failed_replay_snapshots: {result.evidence_pack?.failed_replay_snapshot_ids?.length ?? 0}</div>
                            </div>
                          )}

                          <div className="pt-2 border-t border-white/10">
                            <p className="text-xs text-slate-500 mb-2">Run completed. View this run in the list and see per-input results.</p>
                            <button
                              type="button"
                              onClick={() => {
                                setTab('history');
                                setSelectedRunId(String(result.report_id));
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-xs font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                              View in Runs
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Drift: two big boxes — Recorded data | Re-evaluation (current rules) */}
                  {evalMode === 'drift' && (
                    <div className="xl:col-span-3 space-y-3 pt-2 mt-4">
                      <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 select-none block">Recorded data vs Re-evaluation</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="rounded-2xl border-2 border-white/10 bg-white/[0.02] overflow-hidden flex flex-col min-h-[280px]">
                          <div className="px-4 py-3 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
                            Recorded data
                          </div>
                          <div className="flex-1 overflow-y-auto min-h-0">
                            {datasetIds.length === 0 ? (
                              <div className="p-6 text-sm text-slate-500 text-center">Select a dataset in step 3 to see recorded snapshots.</div>
                            ) : datasetIds.length > 1 ? (
                              <div className="p-6 text-sm text-slate-500 text-center">
                                Multiple datasets selected.<br />Showing snapshots from <strong>{datasets.find((d: any) => d.id === previewDatasetId)?.label || previewDatasetId}</strong> as preview.
                                <div className="mt-2 text-xs opacity-70">Total selected: {datasetIds.length}</div>
                              </div>
                            ) : datasetSnapshotsLoading ? (
                              <div className="p-6 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                              </div>
                            ) : datasetSnapshots404 || datasetSnapshotsError ? (
                              <div className="p-6 text-sm text-amber-200/90 text-center space-y-2">
                                <p>Dataset not found or API unavailable (404).</p>
                                <p className="text-xs text-slate-500">Pick another dataset or check the backend.</p>
                              </div>
                            ) : datasetSnapshots.length === 0 ? (
                              <div className="p-6 text-sm text-slate-500 text-center">No snapshots in this dataset.</div>
                            ) : (
                              <ul className="divide-y divide-white/5">
                                {datasetSnapshots.map((snap: any) => (
                                  <li key={snap.id}>
                                    <button
                                      type="button"
                                      onClick={() => setDriftDetailSnapshot(snap)}
                                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex flex-col gap-0.5"
                                    >
                                      <span className="text-sm font-medium text-slate-200 truncate">
                                        {snap.trace_id ? `Trace ${String(snap.trace_id).slice(0, 8)}…` : `Snapshot ${snap.id}`}
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        {snap.created_at ? new Date(snap.created_at).toLocaleString() : '—'} · {snap.latency_ms != null ? `${snap.latency_ms}ms` : '—'}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                        <div className="rounded-2xl border-2 border-fuchsia-500/30 bg-fuchsia-500/5 overflow-hidden flex flex-col min-h-[280px]">
                          <div className="px-4 py-3 border-b border-fuchsia-500/20 text-xs font-bold uppercase tracking-wider text-fuchsia-400 shrink-0">
                            Re-evaluation (current rules)
                          </div>
                          <div className="flex-1 overflow-y-auto min-h-0 p-4">
                            <p className="text-sm text-slate-500 mb-4">
                              Current project behavior rules and thresholds are applied when you run Validate.
                            </p>
                            {!result ? (
                              <p className="text-sm text-slate-500">Run Validate to see drift results here.</p>
                            ) : (result.drift_runs?.length ?? 0) > 0 ? (
                              <ul className="space-y-2">
                                {(result.drift_runs ?? []).map((run: any, idx: number) => (
                                  <li key={run.trace_id ?? idx} className="rounded-lg border border-white/5 bg-black/20 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium text-slate-200 truncate">
                                        {run.trace_id ? `Trace ${String(run.trace_id).slice(0, 12)}…` : `Run ${run.run_index ?? idx + 1}`}
                                      </span>
                                      <span className={run.pass ? 'text-emerald-400 text-xs font-semibold' : 'text-rose-400 text-xs font-semibold'}>
                                        {run.pass ? 'PASS' : 'FAIL'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                      Passed: {(run.eval_elements_passed?.length ?? 0)} · Failed: {(run.eval_elements_failed?.length ?? 0)}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-slate-500">No drift runs in this result.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
            <AgentNodePickerModal
              open={agentSelectModalOpen}
              onClose={() => setAgentSelectModalOpen(false)}
              agents={agents}
              loading={agentsLoading}
              onSelect={onAgentSelect}
            />
            <DatasetPickerModal
              open={datasetSelectModalOpen}
              onClose={() => setDatasetSelectModalOpen(false)}
              datasets={datasets}
              loading={datasetsLoading}
              selectedIds={datasetIds}
              onSelect={(ids) => setDatasetIds(ids)}
            />
          </>
        )}

        {tab === 'history' && (
          <div className="rounded-3xl border border-white/5 bg-[#111216] shadow-xl p-7 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={historyStatus}
                onChange={(e) => {
                  setHistoryStatus(e.target.value as 'all' | 'pass' | 'fail');
                  setHistoryOffset(0);
                }}
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100"
                aria-label="Filter by status"
              >
                <option value="all">All</option>
                <option value="pass">Passed</option>
                <option value="fail">Failed</option>
              </select>
              <input
                value={historyTraceId}
                onChange={(e) => {
                  setHistoryTraceId(e.target.value);
                  setHistoryOffset(0);
                }}
                placeholder="Filter by trace ID"
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100 w-48"
                aria-label="Filter by trace ID"
              />
              <button
                onClick={() => mutateHistory()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 hover:border-white/20 transition-colors"
              >
                <RefreshCcw className="w-3.5 h-3.5" aria-hidden /> Refresh
              </button>
            </div>

            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-white/5 border border-white/5 animate-pulse" aria-hidden />
                ))}
              </div>
            ) : historyItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <Flag className="w-10 h-10 text-slate-600 mx-auto mb-2" aria-hidden />
                <p className="text-sm text-slate-500">No validation history yet.</p>
                <p className="text-xs text-slate-600 mt-1">Run a validation on the Validate tab to see records here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-2">
                  {historyItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedRunId(item.id);
                        setExpandedHistoryId((id) => (id === item.id ? null : item.id));
                      }}
                      className={`w-full text-left rounded-lg border p-3 transition-colors flex flex-wrap items-center justify-between gap-2 ${selectedRunId === item.id ? 'border-fuchsia-500/50 bg-fuchsia-500/10' : 'border-white/10 bg-black/20 hover:bg-white/5'
                        }`}
                    >
                      <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
                        {item.status === 'pass' ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden />
                        ) : (
                          <ShieldX className="w-4 h-4 text-rose-400" aria-hidden />
                        )}
                        <span className={item.status === 'pass' ? 'text-emerald-400' : 'text-rose-400'}>
                          {item.status === 'pass' ? 'Passed' : 'Failed'}
                        </span>
                        <span className="text-slate-500 text-xs font-normal uppercase tracking-wider">
                          {item.mode === 'drift' ? 'Drift' : 'Regression'}
                        </span>
                        <span className="text-slate-400 font-normal truncate">· {item.trace_id}</span>
                      </div>
                      <div className="text-xs text-slate-400">{item.created_at || '-'}</div>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-2">
                  {selectedRunId ? (
                    (() => {
                      const useCurrentResult = result && String(result.report_id) === selectedRunId;
                      const runMeta = historyItems.find((i) => i.id === selectedRunId);
                      const report = useCurrentResult ? null : selectedRunReport;
                      const isLoading = !useCurrentResult && !report && selectedRunId;
                      if (isLoading) {
                        return (
                          <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-slate-500">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" aria-hidden />
                            Loading run details…
                          </div>
                        );
                      }
                      const status = useCurrentResult ? (result!.pass ? 'pass' : 'fail') : (report?.status === 'pass' ? 'pass' : 'fail');
                      const failureReasons = useCurrentResult ? result!.failure_reasons : [];
                      const failedIds = useCurrentResult ? (result!.evidence_pack?.failed_replay_snapshot_ids ?? []) : [];
                      const violations = useCurrentResult ? (result!.run_results?.[0]?.violations ?? []) : (report?.violations ?? []);
                      return (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-6 space-y-6">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-slate-200">Run detail</h3>
                            <button
                              type="button"
                              onClick={() => setSelectedRunId(null)}
                              className="text-xs text-slate-500 hover:text-slate-300"
                            >
                              Close
                            </button>
                          </div>
                          {runMeta && (
                            <div className="text-xs text-slate-500 space-y-1">
                              <div>Trace: {runMeta.trace_id}</div>
                              <div>Baseline: {runMeta.baseline_trace_id || '—'}</div>
                              {runMeta.agent_id && <div>Agent: {runMeta.agent_id}</div>}
                              <div>Created: {runMeta.created_at || '—'}</div>
                              {runMeta.repeat_runs != null && (
                                <div>Runs: {runMeta.passed_runs ?? 0}/{runMeta.repeat_runs} passed</div>
                              )}
                            </div>
                          )}
                          <div>
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Results</h4>
                            <div className={`rounded-lg border px-3 py-2 ${status === 'pass' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                              <span className="font-medium">
                                {runMeta?.mode === 'drift'
                                  ? (status === 'pass' ? 'Drift: Passed' : 'Drift: Failed')
                                  : (status === 'pass' ? 'Regression: Passed' : 'Regression: Failed')}
                              </span>
                              {failureReasons.length > 0 && (
                                <ul className="mt-2 space-y-0.5 text-xs">
                                  {failureReasons.slice(0, 5).map((r: string, i: number) => (
                                    <li key={i}>• {r}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tested data</h4>
                            <p className="text-xs text-slate-500 mb-2">Where each eval passed or failed. Click a row for more detail (coming soon).</p>
                            <div className="rounded-lg border border-white/10 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-white/5 border-b border-white/10">
                                    <th className="text-left py-2 px-3 font-semibold text-slate-400">Input / Rule</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-400">Regression</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {useCurrentResult && result!.pass && (
                                    <tr className="border-b border-white/5">
                                      <td className="py-2 px-3 text-slate-500">All inputs</td>
                                      <td className="py-2 px-3 text-emerald-400">Passed</td>
                                    </tr>
                                  )}
                                  {useCurrentResult && !result!.pass && failedIds.map((id: string) => (
                                    <tr key={id} className="border-b border-white/5 hover:bg-white/5">
                                      <td className="py-2 px-3 text-slate-300 font-mono">{id}</td>
                                      <td className="py-2 px-3 text-rose-400">Failed</td>
                                    </tr>
                                  ))}
                                  {useCurrentResult && !result!.pass && failedIds.length > 0 && (
                                    <tr className="border-b border-white/5">
                                      <td className="py-2 px-3 text-slate-500">Other inputs</td>
                                      <td className="py-2 px-3 text-emerald-400">Passed</td>
                                    </tr>
                                  )}
                                  {violations.slice(0, 20).map((v: any, idx: number) => (
                                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                                      <td className="py-2 px-3 text-slate-300">{v.rule_id || v.rule_name || '—'} {v.step_ref != null ? `(step ${v.step_ref})` : ''}</td>
                                      <td className="py-2 px-3 text-rose-400">Failed</td>
                                    </tr>
                                  ))}
                                  {violations.length === 0 && !(useCurrentResult && result && (result.pass || failedIds.length > 0)) && (
                                    <tr>
                                      <td colSpan={2} className="py-4 px-3 text-slate-500 text-center">No per-input breakdown in this report.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                      <p className="text-sm text-slate-500">Select a run from the list to see detail and where each eval passed or failed.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/10">
              <span>
                {historyTotal} {historyTotal === 1 ? 'record' : 'records'}
                {historyTotal > 0 && (
                  <> · showing {historyOffset + 1}–{Math.min(historyOffset + historyLimit, historyTotal)}</>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={historyOffset <= 0}
                  onClick={() => setHistoryOffset((v) => Math.max(0, v - historyLimit))}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <button
                  disabled={historyOffset + historyLimit >= historyTotal}
                  onClick={() => setHistoryOffset((v) => v + historyLimit)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {baselineDetailSnapshot && (
          <SnapshotDetailModal
            snapshot={baselineDetailSnapshot}
            onClose={() => setBaselineDetailSnapshot(null)}
            policyState={{ status: 'idle' }}
            evalRows={(() => {
              const snap = baselineDetailSnapshot as unknown as Record<string, unknown> | null;
              const checks = snap?.eval_checks_result;
              if (!checks || typeof checks !== 'object' || Array.isArray(checks)) return [];
              return Object.entries(checks).map(([id, status]) => ({ id, status: String(status) }));
            })()}
            evalEnabled={true}
            evalContextLabel={(() => {
              const snap = baselineDetailSnapshot as unknown as Record<string, unknown>;
              const cur = (agentEvalData as Record<string, unknown> | undefined)?.current_eval_config_version as string | undefined;
              const snapVer = snap?.eval_config_version as string | undefined;
              const stale = cur && snapVer && snapVer !== cur;
              return stale ? 'Eval result from snapshot capture time. Eval config has changed since then.' : 'Eval result from snapshot capture time.';
            })()}
          />
        )}
        {driftDetailSnapshot && (
          <SnapshotDetailModal
            snapshot={driftDetailSnapshot}
            onClose={() => setDriftDetailSnapshot(null)}
            policyState={{ status: 'idle' }}
            evalRows={[]}
            evalEnabled={false}
          />
        )}
      </AnimatePresence>
    </CanvasPageLayout>
  );
}

