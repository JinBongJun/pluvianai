'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
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
  projectUserApiKeysAPI,
  projectsAPI,
  releaseGateAPI,
  type ReleaseGateHistoryResponse,
  type ReleaseGateResult,
} from '@/lib/api';

type GateTab = 'validate' | 'history';
type EditableTool = { id: string; name: string; description: string; parameters: string };
type ThresholdPreset = 'strict' | 'default' | 'lenient' | 'custom';
type GateThresholds = { failRateMax: number; flakyRateMax: number };
type ReleaseGateDatasetSummary = {
  id: string;
  label?: string;
  snapshot_ids?: unknown[];
  snapshot_count?: number;
};
type ReplayProvider = 'openai' | 'anthropic' | 'google';
type ProjectUserApiKeyItem = {
  id: number;
  provider: string;
  agent_id?: string | null;
  is_active: boolean;
  name?: string | null;
  created_at?: string | null;
};
const RECENT_SNAPSHOT_LIMIT = 100;
const BASELINE_SNAPSHOT_LIMIT = 200;
const REPLAY_PROVIDER_LABEL: Record<ReplayProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};
const REPLAY_PROVIDER_MODEL_LIBRARY: Record<ReplayProvider, string[]> = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'o1',
    'o1-mini',
    'o3',
    'o3-mini',
    'o4-mini',
  ],
  anthropic: [
    'claude-3-7-sonnet-latest',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-latest',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  google: [
    'gemini-2.5-pro-preview',
    'gemini-2.5-flash-preview',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
  ],
};
const REPLAY_THRESHOLD_PRESETS = {
  strict: {
    label: 'Strict (5%/1%)',
    failRateMax: 0.05,
    flakyRateMax: 0.01,
  },
  default: {
    label: 'Default (5%/3%)',
    failRateMax: 0.05,
    flakyRateMax: 0.03,
  },
  lenient: {
    label: 'Lenient (10%/5%)',
    failRateMax: 0.1,
    flakyRateMax: 0.05,
  },
} as const;

function toNum(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampRate(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function normalizeGateThresholds(failRateMax: unknown, flakyRateMax: unknown): GateThresholds {
    return {
    failRateMax: clampRate(failRateMax, REPLAY_THRESHOLD_PRESETS.default.failRateMax),
    flakyRateMax: clampRate(flakyRateMax, REPLAY_THRESHOLD_PRESETS.default.flakyRateMax),
  };
}

function normalizeReplayProvider(raw: unknown): ReplayProvider | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'openai' || value === 'anthropic' || value === 'google') return value;
  return null;
}

function inferProviderFromModelId(modelId: unknown): ReplayProvider | null {
  const model = String(modelId ?? '').trim().toLowerCase();
  if (!model) return null;
  if (model.includes('claude') || model.startsWith('anthropic/')) return 'anthropic';
  if (
    model.includes('gemini') ||
    model.includes('google') ||
    model.startsWith('models/gemini') ||
    model.startsWith('google/')
  ) {
    return 'google';
  }
  return 'openai';
}

function collectMissingProviderKeys(result: ReleaseGateResult | null): ReplayProvider[] {
  if (!result) return [];
  const direct = Array.isArray(result.missing_provider_keys)
    ? result.missing_provider_keys
        .map((v) => normalizeReplayProvider(v))
        .filter((v): v is ReplayProvider => Boolean(v))
    : [];
  if (direct.length > 0) return Array.from(new Set(direct));

  const fromReasons = (result.failure_reasons ?? [])
    .join(' ')
    .toLowerCase();
  const inferred: ReplayProvider[] = [];
  if (fromReasons.includes('openai')) inferred.push('openai');
  if (fromReasons.includes('anthropic') || fromReasons.includes('claude')) inferred.push('anthropic');
  if (fromReasons.includes('google') || fromReasons.includes('gemini')) inferred.push('google');
  return Array.from(new Set(inferred));
}

function describeMissingProviderKeys(missingProviders: ReplayProvider[]): string {
  if (missingProviders.length === 0) return '';
  const labels = missingProviders.map((p) => REPLAY_PROVIDER_LABEL[p]).join(', ');
  return `Run blocked: ${labels} API key is not registered for the selected node (or project default). Open Live View, click the node, then register the key in the Settings tab.`;
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
  const [repeatRuns, setRepeatRuns] = useState<number>(3);
  const [thresholdPreset, setThresholdPreset] = useState<ThresholdPreset>('default');
  const [failRateMax, setFailRateMax] = useState<number>(REPLAY_THRESHOLD_PRESETS.default.failRateMax);
  const [flakyRateMax, setFlakyRateMax] = useState<number>(REPLAY_THRESHOLD_PRESETS.default.flakyRateMax);

  const showPrimaryValidateLayout = true;
  const [agentId, setAgentId] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentForPicker | null>(null);
  const [agentSelectModalOpen, setAgentSelectModalOpen] = useState(false);
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<'recent' | 'datasets'>('recent');
  const [snapshotIds, setSnapshotIds] = useState<string[]>([]);
  const [datasetSelectModalOpen, setDatasetSelectModalOpen] = useState(false);
  const [nodeAndDataModalOpen, setNodeAndDataModalOpen] = useState(false);
  const [newModel, setNewModel] = useState('');
  const [replayProvider, setReplayProvider] = useState<ReplayProvider>('openai');
  const [modelOverrideEnabled, setModelOverrideEnabled] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelProviderTab, setModelProviderTab] = useState<ReplayProvider>('openai');
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
  const [selectedRunResultIndex, setSelectedRunResultIndex] = useState<number | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [lastRunReportId, setLastRunReportId] = useState<string | null>(null);
  const [baselineDetailSnapshot, setBaselineDetailSnapshot] = useState<SnapshotForDetail | null>(null);

  useEffect(() => {
    const qAgent = searchParams.get('agent_id') || '';
    if (qAgent) setAgentId(qAgent);
  }, [searchParams]);

  useEffect(() => {
    setSelectedRunResultIndex(null);
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

  // For dataset preview: fetch snapshots from the FIRST selected dataset only.
  const previewDatasetId = datasetIds.length > 0 ? datasetIds[0] : null;

  const datasetSnapshotsKey =
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

  const dataSourceLabel = useMemo(() => {
    if (dataSource === 'datasets') {
      return datasetIds.length > 0 ? 'Dataset(s)' : '';
    }
    if (dataSource === 'recent') {
      return snapshotIds.length > 0 ? 'Recent runs' : '';
    }
    return '';
  }, [dataSource, snapshotIds.length, datasetIds.length]);

  const recentSnapshotsKey =
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
  const runDataProvider = useMemo(() => {
    const fromLatest = normalizeReplayProvider(liveNodeLatestSnapshot?.provider);
    if (fromLatest) return fromLatest;
    const fromBaseline = normalizeReplayProvider((baselineSeedSnapshot as Record<string, unknown> | null)?.provider);
    if (fromBaseline) return fromBaseline;
    return inferProviderFromModelId(runDataModel);
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, runDataModel]);
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
  const effectiveProvider = modelOverrideEnabled ? replayProvider : runDataProvider;
  const effectiveModel = modelOverrideEnabled ? newModel.trim() : runDataModel;

  const canValidate =
    !!agentId?.trim() &&
    ((dataSource === 'recent' && runSnapshotIds.length > 0) || (dataSource === 'datasets' && runDatasetIds.length > 0));

  const projectUserApiKeysKey = projectId && !isNaN(projectId)
    ? ['project-user-api-keys', projectId]
    : null;
  const {
    data: projectUserApiKeysData,
    isLoading: projectUserApiKeysLoading,
  } = useSWR(projectUserApiKeysKey, () => projectUserApiKeysAPI.list(projectId));
  const keyPresenceByAgentAndProvider = useMemo(() => {
    const projectDefaultProviders = new Set<ReplayProvider>();
    const nodeScopedProviders = new Set<string>();
    const items = Array.isArray(projectUserApiKeysData)
      ? (projectUserApiKeysData as ProjectUserApiKeyItem[])
      : [];
    for (const item of items) {
      if (!item?.is_active) continue;
      const normalized = normalizeReplayProvider(item.provider);
      if (!normalized) continue;
      const keyAgentId = (item.agent_id || '').trim();
      if (!keyAgentId) {
        projectDefaultProviders.add(normalized);
        continue;
      }
      nodeScopedProviders.add(`${keyAgentId}::${normalized}`);
    }
    return {
      projectDefaultProviders,
      nodeScopedProviders,
    };
  }, [projectUserApiKeysData]);

  const hasEffectiveProviderKey = useCallback((provider: ReplayProvider, keyAgentId: string | null) => {
    const normalizedAgentId = (keyAgentId || '').trim();
    if (normalizedAgentId && keyPresenceByAgentAndProvider.nodeScopedProviders.has(`${normalizedAgentId}::${provider}`)) {
      return true;
    }
    return keyPresenceByAgentAndProvider.projectDefaultProviders.has(provider);
  }, [keyPresenceByAgentAndProvider]);

  const requiredProviderResolution = useMemo(() => {
    if (modelOverrideEnabled && replayProvider) {
      return {
        providers: [replayProvider],
        unresolvedSnapshotCount: 0,
      };
    }
    const providers = new Set<ReplayProvider>();
    let unresolvedSnapshotCount = 0;
    for (const snapshot of baselineSnapshotsForRun) {
      const provider =
        normalizeReplayProvider((snapshot as Record<string, unknown>).provider) ||
        inferProviderFromModelId((snapshot as Record<string, unknown>).model);
      if (!provider) {
        unresolvedSnapshotCount += 1;
        continue;
      }
      providers.add(provider);
    }
    if (providers.size === 0 && runDataProvider) providers.add(runDataProvider);
    return {
      providers: Array.from(providers),
      unresolvedSnapshotCount,
    };
  }, [modelOverrideEnabled, replayProvider, baselineSnapshotsForRun, runDataProvider]);

  const missingProviderKeys = useMemo(() => {
    if (modelOverrideEnabled) return [];
    const missing = new Set<ReplayProvider>();
    for (const snapshot of baselineSnapshotsForRun) {
      const provider =
        normalizeReplayProvider((snapshot as Record<string, unknown>).provider) ||
        inferProviderFromModelId((snapshot as Record<string, unknown>).model);
      if (!provider) continue;
      const snapshotAgentIdRaw = (snapshot as Record<string, unknown>).agent_id;
      const snapshotAgentId = typeof snapshotAgentIdRaw === 'string' ? snapshotAgentIdRaw : null;
      if (!hasEffectiveProviderKey(provider, snapshotAgentId)) {
        missing.add(provider);
      }
    }
    if (missing.size === 0 && requiredProviderResolution.providers.length > 0 && runDataProvider) {
      if (!hasEffectiveProviderKey(runDataProvider, agentId.trim() || null)) {
        missing.add(runDataProvider);
      }
    }
    return Array.from(missing);
  }, [
    modelOverrideEnabled,
    baselineSnapshotsForRun,
    requiredProviderResolution.providers.length,
    runDataProvider,
    hasEffectiveProviderKey,
    agentId,
  ]);

  const keyRegistrationMessage = useMemo(() => {
    if (!canValidate) return '';
    if (modelOverrideEnabled) return '';
    if (projectUserApiKeysLoading) return 'Checking required API keys...';
    if (requiredProviderResolution.providers.length === 0) {
      return 'Run blocked: provider could not be detected from selected data. Open Live View and verify the latest node snapshot.';
    }
    if (requiredProviderResolution.unresolvedSnapshotCount > 0) {
      return 'Run blocked: one or more selected snapshots have no detectable provider. Open Live View and verify the latest node snapshot.';
    }
    if (missingProviderKeys.length > 0) {
      return describeMissingProviderKeys(missingProviderKeys);
    }
    return 'All required API keys are registered. Ready to run.';
  }, [
    canValidate,
    modelOverrideEnabled,
    projectUserApiKeysLoading,
    requiredProviderResolution.providers.length,
    requiredProviderResolution.unresolvedSnapshotCount,
    missingProviderKeys,
  ]);

  const keyBlocked =
    canValidate &&
    !modelOverrideEnabled &&
    (
      projectUserApiKeysLoading ||
      requiredProviderResolution.providers.length === 0 ||
      requiredProviderResolution.unresolvedSnapshotCount > 0 ||
      missingProviderKeys.length > 0
    );
  const modelOverrideInvalid = modelOverrideEnabled && !newModel.trim();
  const runBlockedMessage = modelOverrideInvalid
    ? 'Run blocked: select a model id for override or switch back to detected model.'
    : keyRegistrationMessage;

  const canRunValidate = canValidate && !keyBlocked && !modelOverrideInvalid;

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

  const liveViewSettingsHref = `/organizations/${orgId}/projects/${projectId}/live-view`;

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
    const selectionKey = selectedSnapshotIdsForRun.join(',');
    if (!selectionKey) return;
    if (!baselineSeedSnapshot || !baselinePayload) return;

    if (selectionKey !== toolsHydratedKey) {
      setToolsList(baselineTools);
      setToolsHydratedKey(selectionKey);
    }

    if (selectionKey !== overridesHydratedKey) {
      setRequestBody(payloadWithoutModel(baselinePayload));
      if (!modelOverrideEnabled) {
      setNewModel(runDataModel);
      }
      const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
      if (inferredProvider) {
        setReplayProvider(inferredProvider);
        if (!modelOverrideEnabled) setModelProviderTab(inferredProvider);
      }
      setRequestJsonError('');
      setOverridesHydratedKey(selectionKey);
    }
  }, [
    selectedSnapshotIdsForRun,
    baselineSeedSnapshot,
    baselinePayload,
    baselineTools,
    runDataModel,
    runDataProvider,
    modelOverrideEnabled,
    toolsHydratedKey,
    overridesHydratedKey,
  ]);

  useEffect(() => {
    if (modelOverrideEnabled) return;
    if (runDataModel) setNewModel(runDataModel);
    const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
    if (!inferredProvider) return;
    setReplayProvider(inferredProvider);
    setModelProviderTab(inferredProvider);
  }, [modelOverrideEnabled, runDataProvider, runDataModel]);

  const handleValidate = async () => {
    if (!projectId || isNaN(projectId) || !canValidate || isValidating) return;
    if (keyBlocked) {
      setError(keyRegistrationMessage || 'Run blocked: required API key is not registered.');
        return;
      }
    if (modelOverrideEnabled && !newModel.trim()) {
      setError('Run blocked: select a model id for override or switch back to detected model.');
      return;
    }
    setIsValidating(true);
    setError('');
    try {
      const thresholds = normalizeGateThresholds(failRateMax, flakyRateMax);
      const payload: Parameters<typeof releaseGateAPI.validate>[1] = {
        agent_id: agentId.trim() || undefined,
        evaluation_mode: 'replay_test',
        model_source: modelOverrideEnabled ? 'platform' : 'detected',
        max_snapshots: 100,
        repeat_runs: repeatRuns,
        fail_rate_max: thresholds.failRateMax,
        flaky_rate_max: thresholds.flakyRateMax,
      };
      if (dataSource === 'recent') {
        payload.snapshot_ids = runSnapshotIds.length ? runSnapshotIds : snapshotIds;
      } else {
        payload.dataset_ids = runDatasetIds.length ? runDatasetIds : datasetIds;
      }
      if (modelOverrideEnabled) {
        payload.new_model = newModel.trim();
        payload.replay_provider = replayProvider;
      }
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

      const res = await releaseGateAPI.validate(projectId, payload);
      setResult(res);
      const missingProviders = collectMissingProviderKeys(res);
      if (missingProviders.length > 0) {
        setError(describeMissingProviderKeys(missingProviders));
      } else {
        setError('');
      }
      if (res?.report_id) setLastRunReportId(String(res.report_id));
      mutateHistory();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const detailObj = detail && typeof detail === 'object' && !Array.isArray(detail)
        ? (detail as { error_code?: string; missing_provider_keys?: string[]; message?: string })
        : null;
      const missingFromDetail = Array.isArray(detailObj?.missing_provider_keys)
        ? detailObj!.missing_provider_keys
          .map((provider) => normalizeReplayProvider(provider))
          .filter((provider): provider is ReplayProvider => Boolean(provider))
        : [];
      const detailMessage = detailObj?.message
        || (Array.isArray(detail)
          ? detail.join(' ')
          : typeof detail === 'string'
        ? detail
            : (e?.message || 'Release Gate validation failed.'));
      const errorCode = String(
        detailObj?.error_code ?? e?.response?.data?.error_code ?? ''
      ).trim().toLowerCase();
      if (errorCode === 'missing_provider_keys' && missingFromDetail.length > 0) {
        setError(describeMissingProviderKeys(missingFromDetail));
      } else if (
        errorCode === 'dataset_agent_mismatch'
        || errorCode === 'dataset_snapshot_agent_mismatch'
      ) {
        setError('Run blocked: selected data includes logs from another node. Re-open "Select node & data" and choose data from one node only.');
      } else if (errorCode === 'missing_api_key' || /api key/i.test(detailMessage)) {
        setError('Run blocked: required API key is not registered. Open Live View, click the node, then register the key in the Settings tab.');
      } else {
        setError(detailMessage);
      }
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
              {showPrimaryValidateLayout ? (
                <>
                  {/* Hero: Configuration Flow (Compact Horizontal Bar) */}
                  <div className="relative z-10 w-full flex flex-col gap-4">
                    <div className="rounded-2xl border border-white/10 bg-[#111216] overflow-hidden shadow-lg p-4 md:p-5 flex flex-col xl:flex-row xl:items-center gap-6 xl:gap-10">
                      
                      {/* Step 1: Target Data (Left) */}
                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-4 xl:border-r border-white/10 xl:pr-10">
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 text-xs font-black">1</span>
                          <span className="text-sm font-bold text-slate-200">Target Data</span>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setNodeAndDataModalOpen(true)}
                          disabled={agentsLoading}
                            className="flex-1 flex items-center justify-between gap-3 rounded-lg bg-black/40 border border-white/10 px-4 py-2.5 text-left transition-all hover:border-fuchsia-500/40 hover:bg-white/5 disabled:opacity-50 min-w-0"
                            title="Select the node and historical data you want to validate"
                        >
                            <span className="text-sm font-medium truncate text-slate-200">
                            {selectedAgent &&
                            ((dataSource === "recent" && snapshotIds.length > 0) ||
                              datasetIds.length > 0)
                              ? dataSource === "recent"
                                  ? `${selectedAgent.display_name || selectedAgent.agent_id} · ${snapshotIds.length} runs`
                                : datasetIds.length === 1
                                  ? (() => {
                                      const d = (datasets as ReleaseGateDatasetSummary[]).find(
                                        (x) => x.id === datasetIds[0]
                                      );
                                      const n =
                                        typeof d?.snapshot_count === "number"
                                          ? d.snapshot_count
                                          : Array.isArray(d?.snapshot_ids)
                                        ? d.snapshot_ids.length
                                        : 0;
                                      return `${selectedAgent.display_name || selectedAgent.agent_id} · ${d?.label || datasetIds[0]} (${n})`;
                                    })()
                                    : `${selectedAgent.display_name || selectedAgent.agent_id} · ${datasetIds.length} sets`
                                : 'Select node & data...'}
                          </span>
                            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                        </button>
                        {dataSourceLabel && (
                            <span className="hidden sm:inline-flex items-center justify-center rounded-md bg-white/5 border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 shrink-0">
                              {dataSourceLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Group: Repeat & Thresholds */}
                      <div className="shrink-0 flex flex-col md:flex-row md:items-center gap-6 xl:gap-10">
                        
                        {/* Step 2: Repeat Runs */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2" title="Number of iterations per snapshot to detect flaky behaviors">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 text-xs font-black">2</span>
                            <span className="text-sm font-bold text-slate-200 whitespace-nowrap">Repeats</span>
                          </div>
                          <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                          {[1, 3, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setRepeatRuns(n)}
                                className={clsx(
                                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                                repeatRuns === n
                                    ? "bg-fuchsia-500/20 text-fuchsia-300 shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                                )}
                            >
                              {n}x
                            </button>
                          ))}
                        </div>
                      </div>

                        {/* Step 3: Gate Thresholds */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2" title="Pass/fail criteria based on fail rate and flaky rate">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 text-xs font-black">3</span>
                            <span className="text-sm font-bold text-slate-200 whitespace-nowrap">Thresholds</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="hidden lg:flex bg-black/40 rounded-lg p-1 border border-white/10">
                              {(Object.keys(REPLAY_THRESHOLD_PRESETS) as Array<keyof typeof REPLAY_THRESHOLD_PRESETS>).map(key => {
                              const preset = REPLAY_THRESHOLD_PRESETS[key];
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => {
                                      const thresholds = normalizeGateThresholds(preset.failRateMax, preset.flakyRateMax);
                                    setThresholdPreset(key);
                                    setFailRateMax(thresholds.failRateMax);
                                    setFlakyRateMax(thresholds.flakyRateMax);
                                  }}
                                    className={clsx(
                                      "px-3 py-1 text-[11px] font-medium rounded-md transition-all whitespace-nowrap",
                                    thresholdPreset === key
                                        ? "bg-fuchsia-500/20 text-fuchsia-300 shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                    )}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                            
                            <div className="flex items-center gap-2">
                              <div className="relative w-[72px]" title="Fail rate limit">
                                <input
                                  type="number"
                                  min={0} max={100} step={0.5}
                                  value={failRateMax * 100}
                                  onChange={e => {
                                    const raw = Number(e.target.value);
                                    if (!Number.isFinite(raw)) return;
                                    setThresholdPreset("custom");
                                    setFailRateMax(clampRate(raw / 100, REPLAY_THRESHOLD_PRESETS.default.failRateMax));
                                  }}
                                  className="w-full rounded-lg bg-black/40 border border-white/10 pl-3 pr-6 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/60 focus:ring-1 focus:ring-fuchsia-500/30 outline-none transition-all text-right"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">%</span>
                              </div>
                              <span className="text-white/20">/</span>
                              <div className="relative w-[72px]" title="Flaky rate limit">
                                <input
                                  type="number"
                                  min={0} max={100} step={0.5}
                                  value={flakyRateMax * 100}
                                  onChange={e => {
                                    const raw = Number(e.target.value);
                                    if (!Number.isFinite(raw)) return;
                                    setThresholdPreset("custom");
                                    setFlakyRateMax(clampRate(raw / 100, REPLAY_THRESHOLD_PRESETS.default.flakyRateMax));
                                  }}
                                  className="w-full rounded-lg bg-black/40 border border-white/10 pl-3 pr-6 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/60 focus:ring-1 focus:ring-fuchsia-500/30 outline-none transition-all text-right"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">%</span>
                              </div>
                        </div>
                      </div>
                    </div>

                      </div>
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
                        if (selection.dataSource === "recent") {
                          setDataSource("recent");
                          setSnapshotIds(selection.snapshotIds);
                          setDatasetIds([]);
                        } else {
                          setDataSource("datasets");
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
                              const count =
                                typeof d?.snapshot_count === "number"
                                  ? d.snapshot_count
                                  : Array.isArray(d?.snapshot_ids)
                                ? d.snapshot_ids.length
                                : 0;
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-1">
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">Detected provider</span>
                              <div className="text-sm text-slate-200 font-medium">
                                {runDataProvider ? REPLAY_PROVIDER_LABEL[runDataProvider] : 'Not detected'}
                              </div>
                              <p className="text-[10px] text-slate-500">
                                Derived from the selected node snapshots.
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 space-y-1">
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">Detected model id</span>
                              <div className="text-sm text-slate-200 font-medium break-all">
                                {runDataModel || 'Not detected'}
                              </div>
                              <p className="text-[10px] text-slate-500">
                                Model is read-only in Release Gate and follows selected data.
                              </p>
                            </div>
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

                      <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-400">
                        {modelOverrideEnabled ? (
                          <>Platform-provided model mode is active. Personal provider key is not required for this run.</>
                        ) : (
                          <>
                            API key registration is managed in Live View node settings.
                            {' '}
                            <Link
                              href={liveViewSettingsHref}
                              className="text-fuchsia-300 hover:text-fuchsia-200 underline underline-offset-2"
                            >
                              Open Live View
                            </Link>
                            {' '}
                            and click a node, then open the Settings tab.
                          </>
                        )}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <span className="text-[10px] uppercase tracking-wide text-slate-500">Model</span>
                            <div className="text-sm text-slate-200 font-medium mt-1 break-all">
                              {effectiveModel || 'Not detected'}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">
                              Provider: {effectiveProvider ? REPLAY_PROVIDER_LABEL[effectiveProvider] : 'Not detected'}
                              {modelOverrideEnabled ? ' (platform-provided override)' : ' (detected)'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                setModelOverrideEnabled(true);
                                const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel) || replayProvider;
                                setReplayProvider(inferredProvider);
                                setModelProviderTab(inferredProvider);
                                if (!newModel.trim()) setNewModel(runDataModel);
                                setModelPickerOpen((open) => !open || !modelOverrideEnabled);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-white/10 transition-colors"
                            >
                              {modelOverrideEnabled ? 'Edit model' : 'Change model'}
                              </button>
                            {modelOverrideEnabled && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModelOverrideEnabled(false);
                                  setModelPickerOpen(false);
                                  setNewModel(runDataModel);
                                  const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
                                  if (inferredProvider) {
                                    setReplayProvider(inferredProvider);
                                    setModelProviderTab(inferredProvider);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-black/40 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                              >
                                Use detected
                              </button>
                            )}
                            </div>
                                  </div>
                        {modelOverrideEnabled && modelPickerOpen && (
                          <div className="space-y-3 rounded-lg border border-white/10 bg-black/30 p-3">
                            <div className="inline-flex rounded-lg border border-white/10 bg-black/40 p-1">
                              {(Object.keys(REPLAY_PROVIDER_MODEL_LIBRARY) as ReplayProvider[]).map((provider) => (
                                <button
                                  key={provider}
                                  type="button"
                                  onClick={() => {
                                    setModelProviderTab(provider);
                                    setReplayProvider(provider);
                                  }}
                                  className={clsx(
                                    'px-3 py-1 text-[11px] font-semibold rounded-md transition-colors',
                                    modelProviderTab === provider
                                      ? 'bg-white/10 text-white'
                                      : 'text-slate-400 hover:text-slate-200'
                                  )}
                                >
                                  {REPLAY_PROVIDER_LABEL[provider]}
                                </button>
                              ))}
                                </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {REPLAY_PROVIDER_MODEL_LIBRARY[modelProviderTab].map((modelId) => (
                                <button
                                  key={modelId}
                                  type="button"
                                  onClick={() => {
                                    setReplayProvider(modelProviderTab);
                                    setNewModel(modelId);
                                    setModelPickerOpen(false);
                                  }}
                                  className={clsx(
                                    'text-left rounded-lg border px-2.5 py-2 text-[11px] transition-colors',
                                    newModel.trim() === modelId && replayProvider === modelProviderTab
                                      ? 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200'
                                      : 'border-white/10 bg-black/30 text-slate-300 hover:bg-white/5'
                                  )}
                                >
                                  {modelId}
                                </button>
                              ))}
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">Custom model id</span>
                              <input
                                value={newModel}
                                onChange={(e) => setNewModel(e.target.value)}
                                placeholder="Type model id"
                                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-fuchsia-500/50 outline-none"
                              />
                              <p className="text-[10px] text-slate-500">
                                Select from presets or type a custom model id for {REPLAY_PROVIDER_LABEL[modelProviderTab]}.
                              </p>
                            </div>
                          </div>
                        )}
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
                              <p className="text-[10px] text-slate-500">Editable. Model is controlled in the Model section above (detected or override). Blur to apply JSON changes. Use Reset to restore baseline.</p>
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
                      {canValidate && keyBlocked && !!keyRegistrationMessage && (
                        <div
                          role="status"
                          className={clsx(
                            "rounded-lg border px-3 py-2 text-xs",
                            keyBlocked
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          )}
                        >
                          {keyRegistrationMessage}
                        </div>
                      )}
                      {error && (
                        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                          <span>{error}</span>
                        </div>
                      )}
                      <div className="mt-auto pt-4">
                        <button
                          onClick={handleValidate}
                          disabled={!canRunValidate || isValidating}
                          title={!canValidate ? 'Select a node and data to validate' : ((!canRunValidate && runBlockedMessage) ? runBlockedMessage : undefined)}
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
                          <p className="text-xs text-center text-slate-500 mt-2">Select a node and data to run.</p>
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
                        ) : (result.run_results?.length ?? 0) > 0 ? (
                          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-[#18191e]">
                            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 px-3 py-2 text-[11px] font-bold text-slate-400 border-b border-white/[0.06]">
                              <span>run</span>
                              <span className="w-14 text-center">eval</span>
                              <span className="min-w-0 truncate">summary</span>
                              <span className="w-16 text-right">latency</span>
                            </div>
                            {(result.run_results ?? []).map((run: any, idx: number) => {
                              const isSelected = selectedRunResultIndex === idx;
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
                                    onClick={() => setSelectedRunResultIndex(isSelected ? null : idx)}
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
                                      {run.behavior_diff != null && (
                                        <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 px-2.5 py-2 space-y-1.5">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Behavior change</p>
                                            {run.behavior_diff.change_band != null && (
                                              <span className={run.behavior_diff.change_band === 'stable' ? 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : run.behavior_diff.change_band === 'minor' ? 'px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30'}>
                                                {run.behavior_diff.change_band === 'stable' ? 'Stable' : run.behavior_diff.change_band === 'minor' ? 'Minor change' : 'Major change'}
                                          </span>
                                        )}
                                      </div>
                                          <p className="text-xs text-slate-400">
                                            Tool call pattern changed by {run.behavior_diff.tool_divergence_pct ?? (run.behavior_diff.tool_divergence != null ? Math.round(run.behavior_diff.tool_divergence * 1000) / 10 : 0)}%.
                                          </p>
                                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-300">
                                            <span>Sequence distance: <strong className="text-slate-200">{run.behavior_diff.sequence_distance}</strong></span>
                                            <span>Tool divergence: <strong className="text-slate-200">{run.behavior_diff.tool_divergence_pct ?? run.behavior_diff.tool_divergence != null ? Math.round(run.behavior_diff.tool_divergence * 1000) / 10 : 0}%</strong></span>
                                          </div>
                                          {(run.behavior_diff.baseline_sequence?.length > 0 || run.behavior_diff.candidate_sequence?.length > 0) && (
                                            <div className="grid grid-cols-1 gap-1 text-[11px] font-mono">
                                              <div className="flex flex-wrap items-center gap-1">
                                                <span className="text-slate-500 shrink-0">Baseline:</span>
                                                {(run.behavior_diff.baseline_sequence ?? []).map((t, i) => (
                                                  <span key={i} className="text-slate-400">{i > 0 && <span className="text-slate-600 mr-1">→</span>}<span className="text-amber-200/90">{t || '—'}</span></span>
                                                ))}
                                                {(run.behavior_diff.baseline_sequence?.length ?? 0) === 0 && <span className="text-slate-500">—</span>}
                                              </div>
                                              <div className="flex flex-wrap items-center gap-1">
                                                <span className="text-slate-500 shrink-0">Run:</span>
                                                {(run.behavior_diff.candidate_sequence ?? []).map((t, i) => (
                                                  <span key={i} className="text-slate-400">{i > 0 && <span className="text-slate-600 mr-1">→</span>}<span className="text-emerald-200/90">{t || '—'}</span></span>
                                                ))}
                                                {(run.behavior_diff.candidate_sequence?.length ?? 0) === 0 && <span className="text-slate-500">—</span>}
                                              </div>
                                            </div>
                                          )}
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
                  <div className="space-y-5 rounded-3xl border border-white/5 bg-[#111216] shadow-xl p-6">
                    {/* Step 1 & 2: Select configuration + dataset */}
                    <div className="grid gap-4 md:grid-cols-2 items-start">
                      {/* Step 1: Agent */}
                      <div className="space-y-2">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 select-none">1. Configuration</span>
                        <button
                          type="button"
                          onClick={() => setAgentSelectModalOpen(true)}
                          disabled={agentsLoading}
                          className="w-full group flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-4 py-2.5 text-left transition-all hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Select agent"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${selectedAgent ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-white/5 text-slate-500"}`}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <div className={`text-sm font-medium truncate ${selectedAgent ? "text-slate-200" : "text-slate-500"}`}>
                                {selectedAgent ? selectedAgent.display_name || selectedAgent.agent_id : "Select agent..."}
                              </div>
                              {selectedAgent && (
                                <div className="text-[11px] text-slate-500 truncate font-mono mt-0.5">
                                  {selectedAgent.model || "Unknown model"}
                                </div>
                              )}
                            </div>
                          </div>
                          <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                        </button>
                        {!agentsLoading && agents.length === 0 && (
                          <p className="text-[11px] text-slate-500 mt-1">Run flows in Live View to see agents here.</p>
                        )}
                      </div>

                      {/* Step 2: Dataset */}
                      <div className="space-y-2">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 select-none">2. Data</span>
                        <button
                          type="button"
                          onClick={() => setDatasetSelectModalOpen(true)}
                          disabled={datasetsLoading || !agentId?.trim()}
                          className="w-full group flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-4 py-2.5 text-left transition-all hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Select data"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${datasetIds.length > 0 ? "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400" : "border-white/10 bg-white/5 text-slate-500"}`}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              {(() => {
                                if (datasetIds.length === 0) {
                                  return <div className="text-sm font-medium text-slate-500">Select data...</div>;
                                }
                                if (datasetIds.length === 1) {
                                  const selectedDataset = datasets.find((d: any) => d.id === datasetIds[0]);
                                  if (!selectedDataset)
                                    return <div className="text-sm font-medium text-slate-200">{datasetIds[0]}</div>;
                                  const count =
                                    typeof selectedDataset.snapshot_count === "number"
                                      ? selectedDataset.snapshot_count
                                      : Array.isArray(selectedDataset.snapshot_ids)
                                        ? selectedDataset.snapshot_ids.length
                                        : 0;
                                  return (
                                    <>
                                      <div className="text-sm font-medium text-slate-200 truncate">
                                        {selectedDataset.label || selectedDataset.id}
                                        <span className="ml-2 inline-flex items-center rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-inset ring-white/10">
                                          {count} runs
                                      </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                        {selectedDataset.created_at
                                          ? new Date(selectedDataset.created_at).toLocaleString()
                                          : "Unknown date"}
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
                                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
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
                          <p className="text-[11px] text-slate-500 mt-1">Select an agent first.</p>
                        )}
                        {agentId?.trim() && !datasetsLoading && datasets.length === 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-[11px] text-slate-500/80">
                              Save datasets in Live View (DATA tab) for this node.
                            </p>
                            <Link
                              href={`/organizations/${orgId}/projects/${projectId}/live-view`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden /> Live View
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Baseline vs candidate editor */}
                    {showPrimaryValidateLayout && (
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
                          title={!canValidate ? 'Select a node and data to validate' : undefined}
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
                            Select a node and data above to continue.
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
                            const failedRatio = typeof result.fail_rate === 'number' ? clampRate(result.fail_rate, result.pass ? 0 : 1) : (result.pass ? 0 : 1);
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

                          {/* Per-run list with pass/fail eval details */}
                          {(result.run_results?.length ?? 0) > 0 ? (
                            <div className="space-y-3">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Runs (new eval applied)</p>
                              <div className="space-y-2">
                                {(result.run_results ?? []).map((run: any, idx: number) => {
                                  const passed = run.eval_elements_passed ?? [];
                                  const failed = run.eval_elements_failed ?? [];
                                  const isSelected = selectedRunResultIndex === idx;
                                  return (
                                    <button
                                      key={run.trace_id ?? run.run_index ?? idx}
                                      type="button"
                                      onClick={() => setSelectedRunResultIndex(isSelected ? null : idx)}
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
                                          {run.behavior_diff != null && (
                                            <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 px-2.5 py-2 space-y-1.5">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Behavior change</p>
                                                {run.behavior_diff.change_band != null && (
                                                  <span className={run.behavior_diff.change_band === 'stable' ? 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : run.behavior_diff.change_band === 'minor' ? 'px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30'}>
                                                    {run.behavior_diff.change_band === 'stable' ? 'Stable' : run.behavior_diff.change_band === 'minor' ? 'Minor change' : 'Major change'}
                                                  </span>
                                                )}
                                              </div>
                                              <p className="text-xs text-slate-400">
                                                Tool call pattern changed by {run.behavior_diff.tool_divergence_pct ?? (run.behavior_diff.tool_divergence != null ? Math.round(run.behavior_diff.tool_divergence * 1000) / 10 : 0)}%.
                                              </p>
                                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-300">
                                                <span>Sequence distance: <strong className="text-slate-200">{run.behavior_diff.sequence_distance}</strong></span>
                                                <span>Tool divergence: <strong className="text-slate-200">{run.behavior_diff.tool_divergence_pct ?? (run.behavior_diff.tool_divergence != null ? Math.round(run.behavior_diff.tool_divergence * 1000) / 10 : 0)}%</strong></span>
                                              </div>
                                              {(run.behavior_diff.baseline_sequence?.length > 0 || run.behavior_diff.candidate_sequence?.length > 0) && (
                                                <div className="grid grid-cols-1 gap-1 text-[11px] font-mono">
                                                  <div className="flex flex-wrap items-center gap-1">
                                                    <span className="text-slate-500 shrink-0">Baseline:</span>
                                                    {(run.behavior_diff.baseline_sequence ?? []).map((t: string, i: number) => (
                                                      <span key={i} className="text-slate-400">{i > 0 && <span className="text-slate-600 mr-1">→</span>}<span className="text-amber-200/90">{t || '—'}</span></span>
                                                    ))}
                                                    {(run.behavior_diff.baseline_sequence?.length ?? 0) === 0 && <span className="text-slate-500">—</span>}
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-1">
                                                    <span className="text-slate-500 shrink-0">Run:</span>
                                                    {(run.behavior_diff.candidate_sequence ?? []).map((t: string, i: number) => (
                                                      <span key={i} className="text-slate-400">{i > 0 && <span className="text-slate-600 mr-1">→</span>}<span className="text-emerald-200/90">{t || '—'}</span></span>
                                                    ))}
                                                    {(run.behavior_diff.candidate_sequence?.length ?? 0) === 0 && <span className="text-slate-500">—</span>}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
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
                        <span className="text-slate-500 text-xs font-normal uppercase tracking-wider">Validation</span>
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
                                {status === 'pass' ? 'Passed' : 'Failed'}
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
                                    <th className="text-left py-2 px-3 font-semibold text-slate-400">Result</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {useCurrentResult && result!.pass && (
                                      <tr className="border-b border-white/5">
                                        <td className="py-2 px-3 text-slate-500">All inputs</td>
                                        <td className="py-2 px-3 text-emerald-400">Passed</td>
                                      </tr>
                                    )}
                                  {useCurrentResult && !result!.pass && failedIds.map((id) => (
                                    <tr key={String(id)} className="border-b border-white/5 hover:bg-white/5">
                                      <td className="py-2 px-3 text-slate-300 font-mono">{String(id)}</td>
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
      </AnimatePresence>
    </CanvasPageLayout>
  );
}

