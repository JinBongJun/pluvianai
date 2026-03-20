"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Flag,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Trash2,
  Upload,
  Activity,
  Settings,
  Play,
  Zap,
  Database,
} from "lucide-react";

import { ReleaseGateLayoutWrapper } from "./ReleaseGateLayoutWrapper";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { ReleaseGateExpandedView } from "./ReleaseGateExpandedView";
import { ReleaseGateMap } from "@/components/release-gate/ReleaseGateMap";
import {
  SnapshotDetailModal,
  type SnapshotForDetail,
} from "@/components/shared/SnapshotDetailModal";
import { AgentNodePickerModal } from "@/components/release-gate/AgentNodePickerModal";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { DatasetPickerModal } from "@/components/release-gate/DatasetPickerModal";
import { PassRateGauge } from "@/components/release-gate/PassRateGauge";
import {
  behaviorAPI,
  liveViewAPI,
  organizationsAPI,
  projectUserApiKeysAPI,
  projectsAPI,
  releaseGateAPI,
  type ReleaseGateHistoryResponse,
  type ReleaseGateResult,
} from "@/lib/api";
import { getApiErrorCode, getApiErrorMessage, redirectToLogin } from "@/lib/api/client";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";

type GateTab = "validate" | "history";
type EditableTool = { id: string; name: string; description: string; parameters: string };
type ThresholdPreset = "strict" | "default" | "lenient" | "custom";
type GateThresholds = { failRateMax: number; flakyRateMax: number };
type ReleaseGateDatasetSummary = {
  id: string;
  label?: string;
  snapshot_ids?: unknown[];
  snapshot_count?: number;
};
type ReplayProvider = "openai" | "anthropic" | "google";
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
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};
const DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY: Record<ReplayProvider, string[]> = {
  openai: [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-mini",
  ],
  anthropic: [
    // Keep conservative, pinned IDs for reproducible Release Gate runs.
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-20250514",
  ],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
  ],
};
const REPLAY_THRESHOLD_PRESETS = {
  strict: {
    label: "Strict",
    failRateMax: 0.05,
    flakyRateMax: 0.01,
  },
  default: {
    label: "Normal",
    failRateMax: 0.05,
    flakyRateMax: 0.03,
  },
  lenient: {
    label: "Lenient",
    failRateMax: 0.1,
    flakyRateMax: 0.05,
  },
  custom: {
    label: "Custom",
    failRateMax: 0.05,
    flakyRateMax: 0.03,
  },
} as const;

/** Provider-level default knobs for replay when no snapshot payload exists or has no config. */
const PROVIDER_PAYLOAD_TEMPLATES: Record<ReplayProvider, Record<string, unknown>> = {
  openai: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 512,
  },
  anthropic: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 1024,
  },
  google: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 512,
  },
};

const PRESET_TOOLTIPS: Record<keyof typeof REPLAY_THRESHOLD_PRESETS, string> = {
  strict: "Fail 5%, Flaky 1%",
  default: "Fail 5%, Flaky 3%",
  lenient: "Fail 10%, Flaky 5%",
  custom: "Set your own fail and flaky rate limits",
};

function toNum(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampRate(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
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
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "openai" || value === "anthropic" || value === "google") return value;
  return null;
}

function inferProviderFromModelId(modelId: unknown): ReplayProvider | null {
  const model = String(modelId ?? "")
    .trim()
    .toLowerCase();
  if (!model) return null;
  if (
    model.startsWith("gpt") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    model.startsWith("text-embedding") ||
    model.startsWith("openai/")
  ) {
    return "openai";
  }
  if (model.includes("claude") || model.startsWith("anthropic/")) return "anthropic";
  if (
    model.includes("gemini") ||
    model.includes("google") ||
    model.startsWith("models/gemini") ||
    model.startsWith("google/")
  ) {
    return "google";
  }
  return null;
}

function validateCustomModelForProvider(
  provider: ReplayProvider,
  modelId: string
): { ok: true } | { ok: false; message: string } {
  const trimmed = String(modelId ?? "").trim();
  if (!trimmed) return { ok: false, message: "Model id is required." };
  const inferred = inferProviderFromModelId(trimmed);
  if (inferred && inferred !== provider) {
    return {
      ok: false,
      message: `Run blocked: model "${trimmed}" looks like ${REPLAY_PROVIDER_LABEL[inferred]}, but provider is set to ${REPLAY_PROVIDER_LABEL[provider]}.`,
    };
  }
  return { ok: true };
}

function collectMissingProviderKeys(result: ReleaseGateResult | null): ReplayProvider[] {
  if (!result) return [];
  const direct = Array.isArray(result.missing_provider_keys)
    ? result.missing_provider_keys
        .map(v => normalizeReplayProvider(v))
        .filter((v): v is ReplayProvider => Boolean(v))
    : [];
  if (direct.length > 0) return Array.from(new Set(direct));

  const fromReasons = (result.failure_reasons ?? []).join(" ").toLowerCase();
  const inferred: ReplayProvider[] = [];
  if (fromReasons.includes("openai")) inferred.push("openai");
  if (fromReasons.includes("anthropic") || fromReasons.includes("claude"))
    inferred.push("anthropic");
  if (fromReasons.includes("google") || fromReasons.includes("gemini")) inferred.push("google");
  return Array.from(new Set(inferred));
}

function describeMissingProviderKeys(missingProviders: ReplayProvider[]): string {
  if (missingProviders.length === 0) return "";
  const labels = missingProviders.map(p => REPLAY_PROVIDER_LABEL[p]).join(", ");
  return `Run blocked: ${labels} API key is not registered for the selected node (or project default). Open Live View, click the node, then register the key in the Settings tab.`;
}

function ReleaseGateStatusPanel({
  title,
  description,
  tone = "neutral",
  primaryActionLabel,
  onPrimaryAction,
  primaryHref,
}: {
  title: string;
  description: React.ReactNode;
  tone?: "neutral" | "warning" | "danger";
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryHref?: string;
}) {
  const toneClasses =
    tone === "danger"
      ? "border-rose-500/30 bg-[#140f15]"
      : tone === "warning"
        ? "border-amber-500/30 bg-[#15130f]"
        : "border-white/10 bg-[#0f1219]";

  return (
    <div className="flex h-full min-h-[420px] items-center justify-center px-6 py-10">
      <div className={clsx("w-full max-w-2xl rounded-2xl border p-7 shadow-2xl", toneClasses)}>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">{title}</p>
        <div className="mt-3 text-sm leading-relaxed text-slate-200">{description}</div>
        {primaryActionLabel && primaryHref ? (
          <Link
            href={primaryHref}
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            {primaryActionLabel}
          </Link>
        ) : null}
        {primaryActionLabel && onPrimaryAction ? (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            {primaryActionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function extractToolsFromPayload(payload: Record<string, unknown> | null): EditableTool[] {
  if (!payload) return [];
  const rawTools = payload.tools;
  if (!Array.isArray(rawTools)) return [];
  const out: EditableTool[] = [];
  for (const item of rawTools) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fnRaw = obj.function;
    const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
    const name = String(fn.name ?? obj.name ?? "").trim();
    if (!name) continue;
    const description =
      typeof fn.description === "string"
        ? fn.description
        : typeof obj.description === "string"
          ? obj.description
          : "";
    const paramsObj =
      fn.parameters && typeof fn.parameters === "object"
        ? fn.parameters
        : obj.parameters && typeof obj.parameters === "object"
          ? obj.parameters
          : null;
    out.push({
      id: crypto.randomUUID(),
      name,
      description,
      parameters: paramsObj ? JSON.stringify(paramsObj, null, 2) : "{}",
    });
  }
  return out;
}

function extractOverridesFromPayload(
  payload: Record<string, unknown> | null
): Record<string, unknown> {
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

function asPayloadObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** When payload is { request, response }, return the request part; else return payload. */
function getRequestPart(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  if (payload.request && typeof payload.request === "object" && !Array.isArray(payload.request))
    return payload.request as Record<string, unknown>;
  return payload;
}

/** Derive eval pass/fail from snapshot (eval_checks_result or is_worst). */
function snapshotEvalFailed(snap: Record<string, unknown> | null): boolean {
  if (!snap) return false;
  const checks = snap.eval_checks_result;
  if (checks && typeof checks === "object" && !Array.isArray(checks)) {
    const vals = Object.values(checks);
    if (vals.some(v => v === "fail")) return true;
  }
  return Boolean(snap.is_worst);
}

export function sanitizePayloadForPreview(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const base =
    src.request && typeof src.request === "object" && !Array.isArray(src.request)
      ? (src.request as Record<string, unknown>)
      : src;
  const clone = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  delete (clone as any).model;
  delete (clone as any).messages;
  delete (clone as any).message;
  delete (clone as any).user_message;
  delete (clone as any).response;
  delete (clone as any).responses;
  delete (clone as any).input;
  delete (clone as any).inputs;
  delete (clone as any).trace_id;
  delete (clone as any).agent_id;
  delete (clone as any).agent_name;
  return clone;
}

/** Request body for replay: same as payload but without model (model is UI-only) and without snapshot content. */
function payloadWithoutModel(payload: Record<string, unknown> | null): Record<string, unknown> {
  const part = getRequestPart(payload);
  if (!Object.keys(part).length) return {};
  const clone = JSON.parse(JSON.stringify(part)) as Record<string, unknown>;
  delete clone.model;
  // JSON payload in Release Gate should only contain configuration, not per-snapshot
  // content such as messages or responses. These are always taken from snapshots.
  delete (clone as any).messages;
  delete (clone as any).message;
  delete (clone as any).user_message;
  delete (clone as any).response;
  delete (clone as any).responses;
  delete (clone as any).input;
  delete (clone as any).inputs;
  delete (clone as any).trace_id;
  delete (clone as any).agent_id;
  delete (clone as any).agent_name;
  return clone;
}

/** JSON editor view for candidate config: config-only and tools-free. */
function editableRequestBodyWithoutTools(
  body: Record<string, unknown> | null
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  delete clone.model;
  delete clone.tools;
  delete (clone as any).system_prompt;
  delete (clone as any).messages;
  delete (clone as any).message;
  delete (clone as any).user_message;
  delete (clone as any).response;
  delete (clone as any).responses;
  delete (clone as any).input;
  delete (clone as any).inputs;
  delete (clone as any).trace_id;
  delete (clone as any).agent_id;
  delete (clone as any).agent_name;
  return clone;
}

/** Apply system prompt text to request body (top-level and messages if present). */
function applySystemPromptToBody(
  body: Record<string, unknown>,
  systemPrompt: string
): Record<string, unknown> {
  const next = { ...body };
  next.system_prompt = systemPrompt || undefined;
  const msgs = next.messages;
  if (Array.isArray(msgs)) {
    let found = false;
    const nextMsgs = msgs.map((msg: unknown) => {
      if (!msg || typeof msg !== "object") return msg;
      const m = { ...(msg as Record<string, unknown>) };
      if (m.role === "system") {
        found = true;
        m.content = systemPrompt;
      }
      return m;
    });
    if (!found && systemPrompt) nextMsgs.unshift({ role: "system", content: systemPrompt });
    next.messages = nextMsgs;
  }
  return next;
}

function buildFinalCandidateRequest(options: {
  baselineSeedSnapshot: Record<string, unknown> | null;
  baselinePayload: Record<string, unknown> | null;
  nodeBasePayload: Record<string, unknown> | null;
  requestBody: Record<string, unknown>;
  requestSystemPrompt: string;
  modelOverrideEnabled: boolean;
  newModel: string;
}): Record<string, unknown> {
  const {
    baselineSeedSnapshot,
    baselinePayload,
    nodeBasePayload,
    requestBody,
    requestSystemPrompt,
    modelOverrideEnabled,
    newModel,
  } = options;

  const baseFromSnapshot = asPayloadObject(baselineSeedSnapshot?.payload);
  const baseRequest = baseFromSnapshot
    ? getRequestPart(baseFromSnapshot)
    : baselinePayload || nodeBasePayload || {};

  let finalReq: Record<string, unknown> = JSON.parse(JSON.stringify(baseRequest || {}));

  if (modelOverrideEnabled && newModel.trim()) {
    finalReq.model = newModel.trim();
  }

  const trimmedPrompt = requestSystemPrompt.trim();
  if (trimmedPrompt) {
    finalReq = applySystemPromptToBody(finalReq, trimmedPrompt);
  }

  if (typeof requestBody.temperature === "number") {
    finalReq.temperature = requestBody.temperature;
  }
  if (typeof requestBody.max_tokens === "number") {
    finalReq.max_tokens = requestBody.max_tokens;
  }
  if (typeof requestBody.top_p === "number") {
    finalReq.top_p = requestBody.top_p;
  }

  for (const [k, v] of Object.entries(requestBody)) {
    if (
      k === "model" ||
      k === "system_prompt" ||
      k === "messages" ||
      k === "message" ||
      k === "user_message" ||
      k === "response" ||
      k === "responses" ||
      k === "input" ||
      k === "inputs" ||
      k === "trace_id" ||
      k === "agent_id" ||
      k === "agent_name"
    ) {
      continue;
    }
    finalReq[k] = v;
  }

  return finalReq;
}

function extractSystemPromptFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const direct = payload.system_prompt;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const msgs = payload.messages;
  if (!Array.isArray(msgs)) return "";
  for (const msg of msgs) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    if (m.role !== "system") continue;
    const content = m.content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }
  return "";
}

function buildBaselineConfigSummary(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const obj = payload as Record<string, unknown>;
  const parts: string[] = [];

  const temp = obj.temperature;
  if (typeof temp === "number" && Number.isFinite(temp)) {
    parts.push(`Temp ${temp}`);
  }

  const maxTok = obj.max_tokens;
  if (
    maxTok != null &&
    (typeof maxTok === "number"
      ? Number.isInteger(maxTok)
      : Number.isInteger(Number(maxTok))) &&
    Number(maxTok) > 0
  ) {
    parts.push(`Max ${Number(maxTok)}`);
  }

  const topP = obj.top_p;
  if (typeof topP === "number" && Number.isFinite(topP)) {
    parts.push(`Top p ${topP}`);
  }

  const tools = obj.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    const names: string[] = [];
    for (const t of tools) {
      if (!t || typeof t !== "object") continue;
      const tool = t as Record<string, unknown>;
      const fnRaw = tool.function;
      const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
      const name = String(fn.name ?? tool.name ?? "").trim();
      if (name) names.push(name);
    }
    if (names.length > 0) {
      const previewNames = names.slice(0, 3).join(", ");
      const suffix = names.length > 3 ? `, +${names.length - 3}` : "";
      parts.push(`Tools ${names.length}개 (${previewNames}${suffix})`);
    } else {
      parts.push(`Tools ${tools.length}개`);
    }
  }

  return parts.join(" · ");
}

function formatEvalSetting(value: unknown): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Configured";

  const obj = value as Record<string, unknown>;
  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : undefined;
  const details = Object.entries(obj)
    .filter(([k, v]) => k !== "enabled" && v !== undefined && v !== null)
    .slice(0, 2)
    .map(([k, v]) => {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
        return `${k}:${String(v)}`;
      return `${k}:set`;
    })
    .join(" · ");

  if (enabled === false) return details ? `Off · ${details}` : "Off";
  if (enabled === true) return details ? `On · ${details}` : "On";
  return details || "Configured";
}

function shouldShowEvalSetting(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const obj = value as Record<string, unknown>;
  if (typeof obj.enabled === "boolean") return obj.enabled;
  return true;
}

/** Full list so Release Gate shows all check types from saved config (matches backend CHECK_KEYS order). */
const LIVE_VIEW_CHECK_ORDER = [
  "empty",
  "latency",
  "status_code",
  "refusal",
  "json",
  "length",
  "repetition",
  "required",
  "format",
  "leakage",
  "tool",
] as const;

/** Defaults for each check so missing keys in old saved config still appear. */
const DEFAULT_EVAL_CHECK_VALUE: Record<string, { enabled: boolean }> = {
  empty: { enabled: true },
  latency: { enabled: true },
  status_code: { enabled: true },
  refusal: { enabled: true },
  json: { enabled: true },
  length: { enabled: true },
  repetition: { enabled: true },
  required: { enabled: false },
  format: { enabled: false },
  leakage: { enabled: false },
  tool: { enabled: true },
};

const LIVE_VIEW_CHECK_LABELS: Record<string, string> = {
  empty: "Empty / Short Answers",
  latency: "Latency Spikes",
  status_code: "HTTP Error Codes",
  refusal: "Refusal / Non-Answer",
  json: "JSON Validity",
  length: "Output Length Drift",
  repetition: "Repetition / Loops",
  required: "Required Keywords / Fields",
  format: "Format / Sections",
  leakage: "PII / Secret Leakage",
  coherence: "Coherence",
};

export default function ReleaseGatePageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgId = params?.orgId as string;
  const rawProjectId = params?.projectId;
  const projectIdStr = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const projectId = projectIdStr ? Number(projectIdStr) : 0;

  const { data: project } = useSWR(
    projectId && !isNaN(projectId) ? ["project", projectId] : null,
    async () => {
      try {
        return await projectsAPI.get(projectId);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg = e?.response?.data?.detail ?? e?.response?.data?.error?.message ?? "";
        if (status === 404 && (msg === "Project not found" || msg === "Not Found")) {
          router.replace(orgId ? `/organizations/${orgId}/projects` : "/organizations");
          return undefined;
        }
        throw e;
      }
    }
  );
  const { data: org } = useSWR(orgId ? ["organization", orgId] : null, () =>
    organizationsAPI.get(orgId)
  );

  const [tab, setTab] = useState<GateTab>("validate");
  const [viewMode, setViewMode] = useState<"map" | "expanded">("map");
  const [isValidating, setIsValidating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [result, setResult] = useState<ReleaseGateResult | null>(null);
  const [error, setError] = useState("");
  const [planError, setPlanError] = useState<PlanLimitError | null>(null);
  const [repeatRuns, setRepeatRuns] = useState<number>(1);
  const [repeatDropdownOpen, setRepeatDropdownOpen] = useState(false);
  const repeatDropdownRef = useRef<HTMLDivElement>(null);
  const REPEAT_OPTIONS = [1, 10, 50, 100] as const;
  const isHeavyRepeat = repeatRuns === 50 || repeatRuns === 100;
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (repeatDropdownRef.current && !repeatDropdownRef.current.contains(e.target as Node))
        setRepeatDropdownOpen(false);
    };
    if (repeatDropdownOpen) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [repeatDropdownOpen]);
  const [thresholdPreset, setThresholdPreset] = useState<ThresholdPreset>("default");
  const [failRateMax, setFailRateMax] = useState<number>(
    REPLAY_THRESHOLD_PRESETS.default.failRateMax
  );
  const [flakyRateMax, setFlakyRateMax] = useState<number>(
    REPLAY_THRESHOLD_PRESETS.default.flakyRateMax
  );

  const showPrimaryValidateLayout = true;
  const [agentId, setAgentId] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentForPicker | null>(null);
  const [agentSelectModalOpen, setAgentSelectModalOpen] = useState(false);
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<"recent" | "datasets">("recent");
  const [snapshotIds, setSnapshotIds] = useState<string[]>([]);
  const [datasetSelectModalOpen, setDatasetSelectModalOpen] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [replayProvider, setReplayProvider] = useState<ReplayProvider>("openai");
  const [modelOverrideEnabled, setModelOverrideEnabled] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelProviderTab, setModelProviderTab] = useState<ReplayProvider>("openai");
  const [requestBody, setRequestBody] = useState<Record<string, unknown>>({});
  const [requestJsonDraft, setRequestJsonDraft] = useState<string | null>(null);
  const [requestJsonError, setRequestJsonError] = useState("");
  const [temperatureDraft, setTemperatureDraft] = useState<string | null>(null);
  const [maxTokensDraft, setMaxTokensDraft] = useState<string | null>(null);
  const [toolsList, setToolsList] = useState<EditableTool[]>([]);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [toolsHydratedKey, setToolsHydratedKey] = useState("");
  const [overridesHydratedKey, setOverridesHydratedKey] = useState("");

  const [runDatasetIds, setRunDatasetIds] = useState<string[]>([]);
  const [runSnapshotIds, setRunSnapshotIds] = useState<string[]>([]);
  const [expandedDatasetId, setExpandedDatasetId] = useState<string | null>(null);

  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const [historyStatus, setHistoryStatus] = useState<"all" | "pass" | "fail">("all");
  const [historyTraceId, setHistoryTraceId] = useState("");
  const [historyOffset, setHistoryOffset] = useState(0);
  const historyLimit = 20;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resultDetailsOpen, setResultDetailsOpen] = useState(false);
  const [selectedRunResultIndex, setSelectedRunResultIndex] = useState<number | null>(null);
  const [expandedCaseIndex, setExpandedCaseIndex] = useState<number | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<{
    caseIndex: number;
    attemptIndex: number;
  } | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [lastRunReportId, setLastRunReportId] = useState<string | null>(null);
  const [baselineDetailSnapshot, setBaselineDetailSnapshot] = useState<SnapshotForDetail | null>(
    null
  );
  const runLocked = isValidating || Boolean(activeJobId);
  const { data: coreModelsData } = useSWR(
    projectId && !isNaN(projectId) ? ["release-gate-core-models", projectId] : null,
    () => releaseGateAPI.getCoreModels(projectId),
    { isPaused: () => runLocked }
  );
  const cancelRequestedRef = useRef(false);
  const pollNowRef = useRef<null | (() => void)>(null);
  const cancelBurstRemainingRef = useRef(0);
  const CANCEL_BURST_POLLS = 8;
  const CANCEL_BURST_INTERVAL_MS = 1000;
  const BASE_POLL_INTERVAL_MS = 1500;
  const FAST_POLL_INTERVAL_MS = 800;
  const FAST_POLL_WINDOW_MS = 10000;

  useEffect(() => {
    cancelRequestedRef.current = cancelRequested;
    if (cancelRequested) {
      cancelBurstRemainingRef.current = Math.max(
        cancelBurstRemainingRef.current,
        CANCEL_BURST_POLLS
      );
    } else {
      cancelBurstRemainingRef.current = 0;
    }
  }, [cancelRequested]);

  useEffect(() => {
    const qAgent = searchParams.get("agent_id") || "";
    if (qAgent) {
      setAgentId(qAgent);
      setViewMode("expanded");
    }
  }, [searchParams]);

  const handleCancelActiveJob = async () => {
    if (!projectId || isNaN(projectId)) return;
    const jobId = String(activeJobId || "").trim();
    // "Production-grade" cancel semantics:
    // - If job id is not available yet (async job still starting), remember the user's intent.
    //   We will cancel as soon as the job id is set.
    if (!cancelRequestedRef.current) {
      cancelRequestedRef.current = true;
      setCancelRequested(true);
    }
    cancelBurstRemainingRef.current = Math.max(cancelBurstRemainingRef.current, CANCEL_BURST_POLLS);
    if (!jobId) return;
    try {
      await releaseGateAPI.cancelJob(projectId, jobId);
      if (pollNowRef.current) pollNowRef.current();
      // Polling will observe canceled status and clear UI.
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail?.message ||
        e?.response?.data?.detail ||
        e?.message ||
        "Failed to cancel run.";
      setError(String(msg));
    }
  };

  // When switching nodes, reset JSON/tools state so that seeding reflects the newly selected node.
  useEffect(() => {
    if (!agentId) {
      setRequestBody({});
      setRequestJsonDraft(null);
      setRequestJsonError("");
      setToolsList([]);
      setToolsHydratedKey("");
      setOverridesHydratedKey("");
      setResult(null);
      setError("");
      setActiveJobId(null);
      setCancelRequested(false);
      setIsValidating(false);
      return;
    }
    // For a new agent, clear previous node's config so that node-level seeding can populate fresh defaults.
    setRequestBody({});
    setRequestJsonDraft(null);
    setRequestJsonError("");
    setToolsList([]);
    setToolsHydratedKey("");
    setOverridesHydratedKey("");
    setResult(null);
    setError("");
    setActiveJobId(null);
    setIsValidating(false);
  }, [agentId]);

  useEffect(() => {
    setSelectedRunResultIndex(null);
    setExpandedCaseIndex(null);
    setSelectedAttempt(null);
  }, [result?.report_id]);

  const agentsKey = projectId && !isNaN(projectId) ? ["release-gate-agents", projectId] : null;
  const {
    data: agentsData,
    isLoading: agentsLoading,
    error: agentsError,
    mutate: mutateAgents,
  } = useSWR(
    agentsKey,
    () => releaseGateAPI.getAgents(projectId, 50),
    { isPaused: () => runLocked }
  );
  const agentsLoaded = agentsKey !== null && typeof agentsData !== "undefined";
  const agents = useMemo<AgentForPicker[]>(() => {
    const list = agentsData?.items ?? [];
    return list
      .map((a: { agent_id?: string; display_name?: string }) => ({
        agent_id: a.agent_id ?? "",
        display_name: a.display_name || a.agent_id || "Agent",
        model: null,
        worst_count: 0,
        is_ghost: false,
      }))
      .filter((a: AgentForPicker) => a.agent_id);
  }, [agentsData]);

  useEffect(() => {
    if (agentId && agents.length > 0) {
      const match = agents.find(a => a.agent_id === agentId);
      setSelectedAgent(prev => (prev?.agent_id === agentId ? prev : (match ?? null)));
    } else if (!agentId) {
      setSelectedAgent(null);
    }
  }, [agentId, agents]);

  useEffect(() => {
    setRunDatasetIds(datasetIds.length ? [...datasetIds] : []);
  }, [datasetIds.join(",")]);
  useEffect(() => {
    setRunSnapshotIds(snapshotIds.length ? [...snapshotIds] : []);
  }, [snapshotIds.join(",")]);

  const datasetsKey =
    projectId && !isNaN(projectId) && agentId?.trim()
      ? ["behavior-datasets", projectId, agentId.trim()]
      : null;
  const {
    data: datasetsData,
    isLoading: datasetsLoading,
    error: datasetsError,
    mutate: mutateDatasets,
  } = useSWR(
    datasetsKey,
    () => behaviorAPI.listDatasets(projectId, { agent_id: agentId.trim(), limit: 50 }),
    { isPaused: () => runLocked }
  );
  const datasets = datasetsData?.items ?? [];

  // For dataset run: fetch snapshots from the FIRST selected dataset only (for baseline display).
  const previewDatasetId = runDatasetIds.length > 0 ? runDatasetIds[0] : null;

  const datasetSnapshotsKey =
    projectId && !isNaN(projectId) && previewDatasetId
      ? ["behavior-dataset-snapshots", projectId, previewDatasetId]
      : null;
  const {
    data: datasetSnapshotsData,
    isLoading: datasetSnapshotsLoading,
    error: datasetSnapshotsError,
    mutate: mutateDatasetSnapshots,
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
    },
    { isPaused: () => runLocked }
  );
  const datasetSnapshots = datasetSnapshotsData?.items ?? [];
  const datasetSnapshots404 = !!(datasetSnapshotsData as { _404?: boolean } | undefined)?._404;

  const expandedDatasetSnapshotsKey =
    projectId && !isNaN(projectId) && expandedDatasetId
      ? ["dataset-snapshots-expanded", projectId, expandedDatasetId]
      : null;
  const {
    data: expandedDatasetSnapshotsData,
    isLoading: expandedDatasetSnapshotsLoading,
    error: expandedDatasetSnapshotsError,
    mutate: mutateExpandedDatasetSnapshots,
  } = useSWR(
    expandedDatasetSnapshotsKey,
    async () => {
      try {
        return await behaviorAPI.getDatasetSnapshots(projectId!, expandedDatasetId!);
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return { items: [], total: 0, _404: true };
        }
        throw e;
      }
    },
    { isPaused: () => runLocked }
  );
  const expandedDatasetSnapshots = expandedDatasetSnapshotsData?.items ?? [];
  const expandedDatasetSnapshots404 = !!(
    expandedDatasetSnapshotsData as { _404?: boolean } | undefined
  )?._404;

  const selectedDatasetSnapshotCount = useMemo(
    () =>
      runDatasetIds.reduce((total, datasetId) => {
        const dataset = datasets.find((item: ReleaseGateDatasetSummary) => item.id === datasetId);
        if (!dataset) return total;
        if (typeof dataset.snapshot_count === "number") return total + dataset.snapshot_count;
        if (Array.isArray(dataset.snapshot_ids)) return total + dataset.snapshot_ids.length;
        return total;
      }, 0),
    [datasets, runDatasetIds]
  );
  const selectedBaselineCount =
    runSnapshotIds.length > 0 ? runSnapshotIds.length : selectedDatasetSnapshotCount;
  const selectedDataSummary =
    runSnapshotIds.length > 0
      ? `${runSnapshotIds.length} live log${runSnapshotIds.length === 1 ? "" : "s"} selected`
      : runDatasetIds.length > 0
        ? `${selectedDatasetSnapshotCount} snapshot${selectedDatasetSnapshotCount === 1 ? "" : "s"} from ${runDatasetIds.length} saved dataset${runDatasetIds.length === 1 ? "" : "s"}`
        : "Choose baseline data from Live Logs or Saved Data.";

  const dataSourceLabel = useMemo(() => {
    if (dataSource === "datasets") {
      return datasetIds.length > 0 ? "Dataset(s)" : "";
    }
    if (dataSource === "recent") {
      return snapshotIds.length > 0 ? "Recent runs" : "";
    }
    return "";
  }, [dataSource, snapshotIds.length, datasetIds.length]);

  useEffect(() => {
    if (!activeJobId) return;
    if (!projectId || isNaN(projectId)) return;
    let cancelled = false;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const finalize = async (
      status: "succeeded" | "failed" | "canceled",
      finalResult: any,
      finalJob: any
    ) => {
      if (cancelled) return;
      if (status === "succeeded") {
        setResult(finalResult);
        const rid = String(finalResult?.report_id ?? finalJob?.report_id ?? "").trim();
        if (rid) setLastRunReportId(rid);
        setError("");
        mutateHistory();
      } else if (status === "canceled") {
        setResult(null);
        setError("Run canceled.");
      } else {
        const jobError = finalJob?.error_detail as any;
        setResult(null);
        setError(
          String(jobError?.message || jobError?.detail || "Release Gate validation failed.")
        );
      }
      setActiveJobId(null);
      setIsValidating(false);
      setCancelRequested(false);
    };

    const run = async () => {
      let backoffMs = BASE_POLL_INTERVAL_MS;
      const maxBackoffMs = 12000;
      let consecutiveErrors = 0;
      const pollStartedAtMs = Date.now();
      let wakeRequested = false;
      let wakeFn: (() => void) | null = null;
      const waitForWake = () =>
        new Promise<void>(resolve => {
          wakeFn = resolve;
        });
      pollNowRef.current = () => {
        wakeRequested = true;
        if (wakeFn) {
          const fn = wakeFn;
          wakeFn = null;
          fn();
        }
      };
      const nextDelayMs = () => {
        if (cancelRequestedRef.current && cancelBurstRemainingRef.current > 0) {
          return CANCEL_BURST_INTERVAL_MS;
        }
        if (Date.now() - pollStartedAtMs <= FAST_POLL_WINDOW_MS) {
          return FAST_POLL_INTERVAL_MS;
        }
        return backoffMs;
      };
      const consumeDelayBudget = () => {
        if (cancelRequestedRef.current && cancelBurstRemainingRef.current > 0) {
          cancelBurstRemainingRef.current -= 1;
        }
      };
      while (!cancelled) {
        try {
          const res = await releaseGateAPI.getJob(projectId, activeJobId, 0);
          if (res?.job?.cancel_requested_at && !cancelRequestedRef.current) {
            cancelRequestedRef.current = true;
            setCancelRequested(true);
          }
          const status = String(res?.job?.status || "").toLowerCase();
          if (status === "succeeded" || status === "failed" || status === "canceled") {
            const finalRes = await releaseGateAPI.getJob(projectId, activeJobId, 1);
            const finalStatus = String(finalRes?.job?.status || "").toLowerCase();
            const finalResult = (finalRes as any)?.result ?? null;
            if (
              finalStatus === "succeeded" ||
              finalStatus === "failed" ||
              finalStatus === "canceled"
            ) {
              await finalize(finalStatus, finalResult, finalRes?.job);
              return;
            }
          }
          consecutiveErrors = 0;
          backoffMs = BASE_POLL_INTERVAL_MS;
          if (wakeRequested) {
            wakeRequested = false;
            continue;
          }
          const delay = nextDelayMs();
          consumeDelayBudget();
          await Promise.race([sleep(delay), waitForWake()]);
        } catch (e: any) {
          if (cancelled) return;
          consecutiveErrors += 1;
          const statusCode = e?.response?.status;
          if (statusCode === 401) {
            redirectToLogin({
              code: getApiErrorCode(e),
              message: getApiErrorMessage(e),
            });
            setError("Session expired. Please log in again.");
            setActiveJobId(null);
            setIsValidating(false);
            return;
          }
          if (statusCode === 403) {
            setError("You do not have access to this project.");
            setActiveJobId(null);
            setIsValidating(false);
            return;
          }
          if (statusCode === 404) {
            setError("Job not found (it may have expired or been deleted).");
            setActiveJobId(null);
            setIsValidating(false);
            setCancelRequested(false);
            return;
          }
          if (consecutiveErrors === 1) {
            // Avoid spamming while user is actively canceling.
            if (!cancelRequestedRef.current) setError("Polling delayed (server busy). Retrying…");
          }
          backoffMs = Math.min(Math.max(BASE_POLL_INTERVAL_MS, backoffMs * 2), maxBackoffMs);
          if (wakeRequested) {
            wakeRequested = false;
            continue;
          }
          const delay = nextDelayMs();
          consumeDelayBudget();
          await Promise.race([sleep(delay), waitForWake()]);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      if (pollNowRef.current) pollNowRef.current = null;
    };
  }, [activeJobId, projectId]);

  const recentSnapshotsKey =
    projectId && !isNaN(projectId) && agentId?.trim()
      ? ["release-gate-recent-snapshots", projectId, agentId.trim(), RECENT_SNAPSHOT_LIMIT]
      : null;
  const {
    data: recentSnapshotsData,
    isLoading: recentSnapshotsLoading,
    error: recentSnapshotsError,
    mutate: mutateRecentSnapshots,
  } = useSWR(
    recentSnapshotsKey,
    () => releaseGateAPI.getRecentSnapshots(projectId, agentId!.trim(), RECENT_SNAPSHOT_LIMIT),
    { isPaused: () => runLocked }
  );
  const recentSnapshotsAll = recentSnapshotsData?.items ?? [];
  const recentSnapshots = recentSnapshotsAll;

  const baselineSnapshotPoolKey =
    projectId && !isNaN(projectId) && agentId?.trim()
      ? ["release-gate-baseline-payloads", projectId, agentId.trim(), BASELINE_SNAPSHOT_LIMIT]
      : null;
  const { data: baselineSnapshotPoolData } = useSWR(
    baselineSnapshotPoolKey,
    () =>
      liveViewAPI.listSnapshots(projectId, {
        agent_id: agentId.trim(),
        limit: BASELINE_SNAPSHOT_LIMIT,
        offset: 0,
      }),
    { isPaused: () => runLocked }
  );
  const baselineSnapshotPool = baselineSnapshotPoolData?.items ?? [];

  const selectedSnapshotIdsForRun = useMemo(() => {
    if (dataSource === "recent") return runSnapshotIds.map(x => String(x));
    if (dataSource === "datasets") {
      return datasetSnapshots.map((s: any) => String(s.id));
    }
    return [];
  }, [dataSource, runSnapshotIds, datasetSnapshots]);

  const baselineSnapshotsById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    const isRichSnapshot = (s: Record<string, unknown> | undefined) => {
      if (!s) return false;
      if (typeof s.model === "string" && s.model.trim()) return true;
      if (typeof s.system_prompt === "string" && s.system_prompt.trim()) return true;
      const p = s.payload;
      return Boolean(p && typeof p === "object" && !Array.isArray(p));
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
        .map(id => baselineSnapshotsById.get(id))
        .filter((s): s is Record<string, unknown> => Boolean(s)),
    [selectedSnapshotIdsForRun, baselineSnapshotsById]
  );
  const baselineSeedSnapshot = baselineSnapshotsForRun[0] ?? null;
  const baselinePayload = useMemo(() => {
    const raw = asPayloadObject(baselineSeedSnapshot?.payload);
    return raw ? getRequestPart(raw) : null;
  }, [baselineSeedSnapshot]);
  const baselineTools = useMemo(() => extractToolsFromPayload(baselinePayload), [baselinePayload]);
  const baselineOverrides = useMemo(
    () => extractOverridesFromPayload(baselinePayload),
    [baselinePayload]
  );

  const historyKey = useMemo(
    () =>
      projectId && !isNaN(projectId)
        ? ["release-gate-history", projectId, historyStatus, historyTraceId, historyOffset]
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
        status: historyStatus === "all" ? undefined : historyStatus,
        trace_id: historyTraceId.trim() || undefined,
        limit: historyLimit,
        offset: historyOffset,
      }),
    { keepPreviousData: true, isPaused: () => runLocked }
  );

  const historyItems = historyData?.items || [];
  const historyTotal = historyData?.total || 0;

  const { data: selectedRunReport } = useSWR(
    selectedRunId && projectId && !isNaN(projectId)
      ? ["release-gate-report", projectId, selectedRunId]
      : null,
    () => behaviorAPI.exportReport(projectId, selectedRunId!, "json"),
    { isPaused: () => runLocked }
  );

  const singleSnapshotEvalKey =
    agentId?.trim() && projectId && !isNaN(projectId) ? ["agent-eval", projectId, agentId] : null;
  const { data: agentEvalData } = useSWR(
    singleSnapshotEvalKey,
    () => liveViewAPI.getAgentEvaluation(projectId, agentId),
    { isPaused: () => runLocked }
  );
  const liveNodeLatestKey =
    agentId?.trim() && projectId && !isNaN(projectId)
      ? ["release-gate-live-node-latest", projectId, agentId.trim()]
      : null;
  const { data: liveNodeLatestData } = useSWR(
    liveNodeLatestKey,
    () => liveViewAPI.listSnapshots(projectId, { agent_id: agentId.trim(), limit: 1, offset: 0 }),
    { isPaused: () => runLocked }
  );
  const liveNodeLatestSnapshot = useMemo(() => {
    const items = (liveNodeLatestData as Record<string, unknown> | undefined)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }, [liveNodeLatestData]);
  const liveNodeLatestPayload = useMemo(() => {
    const raw = asPayloadObject(liveNodeLatestSnapshot?.payload);
    return raw ? getRequestPart(raw) : null;
  }, [liveNodeLatestSnapshot]);

  const runDataModel = useMemo(() => {
    const latestModel = liveNodeLatestSnapshot?.model;
    if (typeof latestModel === "string" && latestModel.trim()) return latestModel.trim();
    const fromSnapshot = baselineSeedSnapshot?.model;
    if (typeof fromSnapshot === "string" && fromSnapshot.trim()) return fromSnapshot.trim();
    const latestPayloadModel = liveNodeLatestPayload?.model;
    if (typeof latestPayloadModel === "string" && latestPayloadModel.trim())
      return latestPayloadModel.trim();
    const fromPayload = baselinePayload?.model;
    if (typeof fromPayload === "string" && fromPayload.trim()) return fromPayload.trim();
    return "";
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, liveNodeLatestPayload, baselinePayload]);
  const replayProviderModelLibrary = useMemo(() => {
    const providers = (coreModelsData as { providers?: Record<string, unknown> } | undefined)?.providers;
    if (!providers || typeof providers !== "object") {
      return DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY;
    }
    const normalized: Record<ReplayProvider, string[]> = {
      openai: Array.isArray(providers.openai)
        ? providers.openai.map(v => String(v)).filter(Boolean)
        : [],
      anthropic: Array.isArray(providers.anthropic)
        ? providers.anthropic.map(v => String(v)).filter(Boolean)
        : [],
      google: Array.isArray(providers.google)
        ? providers.google.map(v => String(v)).filter(Boolean)
        : [],
    };
    return {
      openai: normalized.openai.length
        ? normalized.openai
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.openai,
      anthropic: normalized.anthropic.length
        ? normalized.anthropic
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.anthropic,
      google: normalized.google.length
        ? normalized.google
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.google,
    };
  }, [coreModelsData]);
  const runDataProvider = useMemo(() => {
    const fromLatest = normalizeReplayProvider(liveNodeLatestSnapshot?.provider);
    if (fromLatest) return fromLatest;
    const fromBaseline = normalizeReplayProvider(
      (baselineSeedSnapshot as Record<string, unknown> | null)?.provider
    );
    if (fromBaseline) return fromBaseline;
    return inferProviderFromModelId(runDataModel);
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, runDataModel]);
  const runDataPrompt = useMemo(() => {
    const latestPrompt = liveNodeLatestSnapshot?.system_prompt;
    if (typeof latestPrompt === "string" && latestPrompt.trim()) return latestPrompt.trim();
    const extractedFromLatestPayload = extractSystemPromptFromPayload(liveNodeLatestPayload);
    if (extractedFromLatestPayload) return extractedFromLatestPayload;
    const fromSnapshot = baselineSeedSnapshot?.system_prompt;
    if (typeof fromSnapshot === "string" && fromSnapshot.trim()) return fromSnapshot.trim();
    return extractSystemPromptFromPayload(baselinePayload);
  }, [liveNodeLatestSnapshot, liveNodeLatestPayload, baselineSeedSnapshot, baselinePayload]);
  const nodeBasePayload = useMemo(() => {
    if (baselinePayload) return baselinePayload;
    if (liveNodeLatestPayload) return liveNodeLatestPayload;
    const provider =
      normalizeReplayProvider(runDataProvider) || inferProviderFromModelId(runDataModel);
    if (!provider) return null;
    const providerTemplate = PROVIDER_PAYLOAD_TEMPLATES[provider];
    return providerTemplate ? { ...providerTemplate } : null;
  }, [baselinePayload, liveNodeLatestPayload, runDataProvider, runDataModel]);
  const configSourceLabel = useMemo(() => {
    if (runSnapshotIds.length > 0 && baselinePayload) return "Selected live logs";
    if (runDatasetIds.length > 0 && baselinePayload) return "Selected saved data";
    if (liveNodeLatestPayload) return "Latest live snapshot";
    if (nodeBasePayload) return "Provider template";
    return "";
  }, [
    runSnapshotIds.length,
    runDatasetIds.length,
    baselinePayload,
    liveNodeLatestPayload,
    nodeBasePayload,
  ]);

  // When a node is first selected (and no explicit baseline selection yet), seed the JSON payload
  // and tools list from the latest live snapshot (or provider template) so the panel shows a sensible default config.
  useEffect(() => {
    if (!agentId?.trim()) return;
    // If user has already picked specific snapshots/datasets, or we already hydrated for this agent, skip.
    if (selectedSnapshotIdsForRun.length > 0) return;
    if (baselineSeedSnapshot || baselinePayload) return;
    if (overridesHydratedKey === `node:${agentId}`) return;

    // Don't override user-edited JSON/tools for the same node.
    if (Object.keys(requestBody).length > 0 || toolsList.length > 0) return;

    const providerTemplate = (() => {
      const p = normalizeReplayProvider(runDataProvider) || inferProviderFromModelId(runDataModel);
      return p ? PROVIDER_PAYLOAD_TEMPLATES[p] : null;
    })();

    let seedBody: Record<string, unknown> | null = null;
    if (liveNodeLatestPayload) {
      const fromPayload = payloadWithoutModel(liveNodeLatestPayload);
      seedBody = providerTemplate ? { ...providerTemplate, ...fromPayload } : fromPayload;
    } else if (providerTemplate) {
      seedBody = { ...providerTemplate };
    }

    if (!seedBody || Object.keys(seedBody).length === 0) return;
    setRequestBody(seedBody);

    const seedTools = liveNodeLatestPayload ? extractToolsFromPayload(liveNodeLatestPayload) : [];
    if (seedTools.length) setToolsList(seedTools);

    setOverridesHydratedKey(`node:${agentId}`);
  }, [
    agentId,
    selectedSnapshotIdsForRun.length,
    baselineSeedSnapshot,
    baselinePayload,
    liveNodeLatestPayload,
    requestBody,
    toolsList.length,
    runDataProvider,
    runDataModel,
    overridesHydratedKey,
  ]);
  const effectiveProvider = modelOverrideEnabled ? replayProvider : runDataProvider;
  const effectiveModel = modelOverrideEnabled ? newModel.trim() : runDataModel;

  const canValidate =
    !!agentId?.trim() &&
    ((dataSource === "recent" && runSnapshotIds.length > 0) ||
      (dataSource === "datasets" && runDatasetIds.length > 0));

  const projectUserApiKeysKey =
    projectId && !isNaN(projectId) ? ["project-user-api-keys", projectId] : null;
  const { data: projectUserApiKeysData, isLoading: projectUserApiKeysLoading } = useSWR(
    projectUserApiKeysKey,
    () => projectUserApiKeysAPI.list(projectId),
    { isPaused: () => runLocked }
  );
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
      const keyAgentId = (item.agent_id || "").trim();
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

  const hasEffectiveProviderKey = useCallback(
    (provider: ReplayProvider, keyAgentId: string | null) => {
      const normalizedAgentId = (keyAgentId || "").trim();
      if (
        normalizedAgentId &&
        keyPresenceByAgentAndProvider.nodeScopedProviders.has(`${normalizedAgentId}::${provider}`)
      ) {
        return true;
      }
      return keyPresenceByAgentAndProvider.projectDefaultProviders.has(provider);
    },
    [keyPresenceByAgentAndProvider]
  );

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
      const snapshotAgentId = typeof snapshotAgentIdRaw === "string" ? snapshotAgentIdRaw : null;
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
    if (!canValidate) return "";
    if (modelOverrideEnabled) return "";
    if (projectUserApiKeysLoading) return "Checking required API keys...";
    if (requiredProviderResolution.providers.length === 0) {
      return "Run blocked: provider could not be detected from selected data. Open Live View and verify the latest node snapshot.";
    }
    if (requiredProviderResolution.unresolvedSnapshotCount > 0) {
      return "Run blocked: one or more selected snapshots have no detectable provider. Open Live View and verify the latest node snapshot.";
    }
    if (missingProviderKeys.length > 0) {
      return describeMissingProviderKeys(missingProviderKeys);
    }
    return "All required API keys are registered. Ready to run.";
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
    (projectUserApiKeysLoading ||
      requiredProviderResolution.providers.length === 0 ||
      requiredProviderResolution.unresolvedSnapshotCount > 0 ||
      missingProviderKeys.length > 0);
  const modelOverrideInvalid = modelOverrideEnabled && !newModel.trim();
  const runBlockedMessage = modelOverrideInvalid
    ? "Run blocked: select a model id for override or switch back to detected model."
    : keyRegistrationMessage;

  const canRunValidate = canValidate && !keyBlocked && !modelOverrideInvalid;

  const runEvalElements = useMemo(() => {
    const data = agentEvalData as Record<string, unknown> | undefined;
    const configSrc = data?.config as Record<string, unknown> | undefined;
    if (configSrc && typeof configSrc === "object" && !Array.isArray(configSrc)) {
      const fromConfig = LIVE_VIEW_CHECK_ORDER.map(name => {
        const value =
          configSrc[name] !== undefined ? configSrc[name] : DEFAULT_EVAL_CHECK_VALUE[name];
        return { name, value };
      }).filter(({ value }) => value != null && shouldShowEvalSetting(value));
      if (fromConfig.length > 0) return fromConfig;
    }
    // Fallback: use checks from evaluation API (applied to recent logs, e.g. from stored eval_checks_result when no AgentDisplaySetting)
    const checksList = data?.checks as
      | Array<{ id: string; enabled?: boolean; applicable?: number }>
      | undefined;
    if (Array.isArray(checksList) && checksList.length > 0) {
      const applied = checksList
        .filter(c => c.enabled === true || (Number(c.applicable) ?? 0) > 0)
        .map(c => ({ name: c.id, value: { enabled: true } as unknown }));
      if (applied.length > 0) {
        const order = [...LIVE_VIEW_CHECK_ORDER, "coherence"];
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

  const requestSystemPrompt = useMemo(() => {
    const fromBody =
      typeof requestBody.system_prompt === "string"
        ? requestBody.system_prompt
        : extractSystemPromptFromPayload(requestBody);
    if (fromBody && fromBody.trim()) {
      return fromBody.trim();
    }
    // When the editable request body does not yet contain a prompt (e.g. seeded only
    // with sampling knobs or provider template), fall back to the node's detected
    // system prompt so the textarea is prefilled instead of empty.
    return runDataPrompt || "";
  }, [requestBody, runDataPrompt]);
  const requestBodyWithoutTools = useMemo(
    () => editableRequestBodyWithoutTools(requestBody),
    [requestBody]
  );
  const requestBodyJson = useMemo(
    () => JSON.stringify(requestBodyWithoutTools, null, 2),
    [requestBodyWithoutTools]
  );

  const baselineConfigSummary = useMemo(() => {
    const source =
      baselinePayload && Object.keys(baselinePayload).length
        ? baselinePayload
        : nodeBasePayload && Object.keys(nodeBasePayload).length
          ? nodeBasePayload
          : null;
    return buildBaselineConfigSummary(source);
  }, [baselinePayload, nodeBasePayload]);

  const finalCandidateRequest = useMemo(
    () =>
      buildFinalCandidateRequest({
        baselineSeedSnapshot,
        baselinePayload,
        nodeBasePayload,
        requestBody,
        requestSystemPrompt,
        modelOverrideEnabled,
        newModel,
      }),
    [
      baselineSeedSnapshot,
      baselinePayload,
      nodeBasePayload,
      requestBody,
      requestSystemPrompt,
      modelOverrideEnabled,
      newModel,
    ]
  );

  /**
   * UI preview for what Release Gate validate will override and send.
   * Intentionally excludes snapshot conversation ("messages") so the preview
   * stays clean and doesn't duplicate system prompt content.
   */
  const validateOverridePreview = useMemo(() => {
    const preview: Record<string, unknown> = {
      model_source: modelOverrideEnabled ? "platform" : "detected",
    };

    if (modelOverrideEnabled) {
      const trimmedModel = newModel.trim();
      if (trimmedModel) {
        const inferredProvider = inferProviderFromModelId(trimmedModel);
        const effectiveProvider = inferredProvider || replayProvider;
        preview.new_model = trimmedModel;
        preview.replay_provider = effectiveProvider;
      }
    }

    const sys =
      (typeof requestBody.system_prompt === "string"
        ? requestBody.system_prompt
        : requestSystemPrompt
      ).trim() || undefined;
    if (sys) preview.new_system_prompt = sys;

    const temp = requestBody.temperature;
    if (temp != null && typeof temp === "number" && Number.isFinite(temp) && temp >= 0) {
      preview.replay_temperature = temp;
    }

    const maxTok = requestBody.max_tokens;
    if (
      maxTok != null &&
      (typeof maxTok === "number"
        ? Number.isInteger(maxTok)
        : Number.isInteger(Number(maxTok))) &&
      Number(maxTok) > 0
    ) {
      preview.replay_max_tokens = Number(maxTok);
    }

    const topP = requestBody.top_p;
    if (topP != null && typeof topP === "number" && Number.isFinite(topP)) {
      preview.replay_top_p = topP;
    }

    const overrides: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(requestBody)) {
      if (
        k === "model" ||
        k === "system_prompt" ||
        k === "messages" ||
        k === "temperature" ||
        k === "max_tokens" ||
        k === "top_p"
      ) {
        continue;
      }
      overrides[k] = v;
    }

    // Tools are passed via replay_overrides.tools (built from toolsList),
    // unless requestBody already contains a tools array.
    if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
      overrides.tools = requestBody.tools;
    } else if (toolsList.length > 0) {
      const built: Array<Record<string, unknown>> = [];
      for (const t of toolsList) {
        const name = t.name.trim();
        if (!name) continue;
        let params: Record<string, unknown> = {};
        if (t.parameters.trim()) {
          try {
            const p = JSON.parse(t.parameters.trim());
            if (p && typeof p === "object") params = p as Record<string, unknown>;
          } catch {
            continue;
          }
        }
        built.push({
          type: "function",
          function: {
            name,
            description: t.description.trim() || undefined,
            ...(Object.keys(params).length ? { parameters: params } : {}),
          },
        });
      }
      if (built.length) overrides.tools = built;
    }

    if (Object.keys(overrides).length) {
      preview.replay_overrides = overrides;
    }

    return preview;
  }, [
    modelOverrideEnabled,
    newModel,
    replayProvider,
    requestBody,
    requestSystemPrompt,
    toolsList,
  ]);

  const handleRequestJsonBlur = useCallback(() => {
    const raw = requestJsonDraft ?? requestBodyJson;
    const trimmed = raw.trim();
    if (!trimmed) {
      const next =
        Array.isArray(requestBody.tools) && requestBody.tools.length > 0
          ? { tools: requestBody.tools }
          : {};
      setRequestBody(next);
      setRequestJsonDraft(null);
      setRequestJsonError("");
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setRequestJsonError("Must be a JSON object.");
        return;
      }
      const obj = parsed as Record<string, unknown>;
      // Keep JSON editor focused on configuration-only fields.
      delete obj.model;
      delete (obj as any).system_prompt;
      delete (obj as any).messages;
      delete (obj as any).message;
      delete (obj as any).user_message;
      delete (obj as any).response;
      delete (obj as any).responses;
      delete (obj as any).input;
      delete (obj as any).inputs;
      delete (obj as any).trace_id;
      delete (obj as any).agent_id;
      delete (obj as any).agent_name;
      if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
        obj.tools = requestBody.tools;
      }
      setRequestBody(obj);
      setRequestJsonDraft(null);
      setRequestJsonError("");
    } catch {
      setRequestJsonError("Invalid JSON.");
    }
  }, [requestBody, requestBodyJson, requestJsonDraft]);

  const handleResetRequestJson = useCallback(() => {
    if (!baselinePayload) return;
    setRequestBody(payloadWithoutModel(baselinePayload));
    setRequestJsonDraft(null);
    setRequestJsonError("");
  }, [baselinePayload]);

  useEffect(() => {
    if (toolsList.length === 0) {
      setRequestBody(prev => {
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
          if (p && typeof p === "object") params = p as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      built.push({
        type: "function",
        function: {
          name,
          description: t.description.trim() || undefined,
          ...(Object.keys(params).length ? { parameters: params } : {}),
        },
      });
    }
    if (built.length) setRequestBody(prev => ({ ...prev, tools: built }));
  }, [toolsList]);

  useEffect(() => {
    const selectionKey = selectedSnapshotIdsForRun.join(",");
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
        const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
        if (inferredProvider) {
          setReplayProvider(inferredProvider);
          setModelProviderTab(inferredProvider);
        }
      }
      setRequestJsonError("");
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

  // Keep provider selection user-driven while overriding.
  // We validate mismatch at run time and show a clear error instead of silently changing tabs/providers.

  const handleValidate = async () => {
    if (!projectId || isNaN(projectId) || !canValidate || isValidating) return;
    if (keyBlocked) {
      setError(keyRegistrationMessage || "Run blocked: required API key is not registered.");
      return;
    }
    if (modelOverrideEnabled && !newModel.trim()) {
      setError("Run blocked: select a model id for override or switch back to detected model.");
      return;
    }
    if (modelOverrideEnabled) {
      const modelValidation = validateCustomModelForProvider(replayProvider, newModel);
      if (!modelValidation.ok) {
        setError(modelValidation.message);
        return;
      }
    }
    setIsValidating(true);
    setCancelRequested(false);
    cancelRequestedRef.current = false;
    setPlanError(null);
    setError("");
    let startedAsyncJob = false;
    try {
      const thresholds = normalizeGateThresholds(failRateMax, flakyRateMax);
      const payload: Parameters<typeof releaseGateAPI.validate>[1] = {
        agent_id: agentId.trim() || undefined,
        evaluation_mode: "replay_test",
        model_source: modelOverrideEnabled ? "platform" : "detected",
        max_snapshots: 100,
        repeat_runs: repeatRuns,
        fail_rate_max: thresholds.failRateMax,
        flaky_rate_max: thresholds.flakyRateMax,
      };
      if (runSnapshotIds.length > 0) {
        payload.snapshot_ids = runSnapshotIds;
      } else if (runDatasetIds.length > 0) {
        payload.dataset_ids = runDatasetIds;
      }
      if (modelOverrideEnabled) {
        const trimmedModel = newModel.trim();
        const effectiveProvider = replayProvider;
        payload.new_model = trimmedModel;
        payload.replay_provider = effectiveProvider;
      }
      payload.new_system_prompt =
        (typeof requestBody.system_prompt === "string"
          ? requestBody.system_prompt
          : requestSystemPrompt
        ).trim() || undefined;
      const temp = requestBody.temperature;
      const maxTok = requestBody.max_tokens;
      const topP = requestBody.top_p;
      if (temp != null && typeof temp === "number" && Number.isFinite(temp) && temp >= 0)
        payload.replay_temperature = temp;
      if (
        maxTok != null &&
        (typeof maxTok === "number"
          ? Number.isInteger(maxTok)
          : Number.isInteger(Number(maxTok))) &&
        Number(maxTok) > 0
      )
        payload.replay_max_tokens = Number(maxTok);
      if (topP != null && typeof topP === "number" && Number.isFinite(topP))
        payload.replay_top_p = topP;
      const overrides: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(requestBody)) {
        if (
          k === "model" ||
          k === "system_prompt" ||
          k === "messages" ||
          k === "temperature" ||
          k === "max_tokens" ||
          k === "top_p"
        )
          continue;
        overrides[k] = v;
      }
      if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
        overrides.tools = requestBody.tools;
      } else if (toolsList.length > 0) {
        const built: Array<Record<string, unknown>> = [];
        for (const t of toolsList) {
          const name = t.name.trim();
          if (!name) continue;
          let params: Record<string, unknown> = {};
          if (t.parameters.trim()) {
            try {
              const p = JSON.parse(t.parameters.trim());
              if (p && typeof p === "object") params = p as Record<string, unknown>;
            } catch {
              setError(`Tool "${name}": parameters must be valid JSON.`);
              setIsValidating(false);
              return;
            }
          }
          built.push({
            type: "function",
            function: {
              name,
              description: t.description.trim() || undefined,
              ...(Object.keys(params).length ? { parameters: params } : {}),
            },
          });
        }
        if (built.length) overrides.tools = built;
      }
      if (Object.keys(overrides).length) payload.replay_overrides = overrides;
      const jobRes = await releaseGateAPI.validateAsync(projectId, payload);
      const jobId = String(jobRes?.job?.id || "").trim();
      if (!jobId) {
        throw new Error("Failed to start Release Gate job.");
      }
      setResult(null);
      setActiveJobId(jobId);
      startedAsyncJob = true;
      if (cancelRequestedRef.current) {
        try {
          await releaseGateAPI.cancelJob(projectId, jobId);
        } catch {
          // If cancel fails transiently, polling will still surface final status/error.
        } finally {
          if (pollNowRef.current) pollNowRef.current();
        }
      }
    } catch (e: any) {
      const parsedPlanError = parsePlanLimitError(e);
      if (parsedPlanError && parsedPlanError.code === "LIMIT_PLATFORM_REPLAY_CREDITS") {
        setPlanError(parsedPlanError);
        setError(
          parsedPlanError.message ||
            "You have used all hosted replay credits for this billing period. Use your own provider key or upgrade your plan for more hosted runs."
        );
        setResult(null);
        return;
      }
      const detail = e?.response?.data?.detail;
      const detailObj =
        detail && typeof detail === "object" && !Array.isArray(detail)
          ? (detail as { error_code?: string; missing_provider_keys?: string[]; message?: string })
          : null;
      const missingFromDetail = Array.isArray(detailObj?.missing_provider_keys)
        ? detailObj!.missing_provider_keys
            .map(provider => normalizeReplayProvider(provider))
            .filter((provider): provider is ReplayProvider => Boolean(provider))
        : [];
      const detailMessage =
        detailObj?.message ||
        (Array.isArray(detail)
          ? detail.join(" ")
          : typeof detail === "string"
            ? detail
            : e?.message || "Release Gate validation failed.");
      const errorCode = String(detailObj?.error_code ?? e?.response?.data?.error_code ?? "")
        .trim()
        .toLowerCase();
      if (errorCode === "missing_provider_keys" && missingFromDetail.length > 0) {
        setError(describeMissingProviderKeys(missingFromDetail));
      } else if (
        errorCode === "dataset_agent_mismatch" ||
        errorCode === "dataset_snapshot_agent_mismatch"
      ) {
        setError(
          "Run blocked: selected data includes logs from another node. Use only Live view logs or Saved data for this node."
        );
      } else if (errorCode === "release_gate_requires_pinned_model") {
        setError(
          "Run blocked: Release Gate requires a pinned Anthropic model id for reproducibility (ends with YYYYMMDD)."
        );
      } else if (errorCode === "provider_model_mismatch") {
        setError(
          "Run blocked: selected provider does not match the model id. Pick the matching provider tab or choose a model from that provider."
        );
      } else if (errorCode === "missing_api_key" || /api key/i.test(detailMessage)) {
        setError(
          "Run blocked: required API key is not registered. Open Live View, click the node, then register the key in the Settings tab."
        );
      } else {
        setError(detailMessage);
      }
      setResult(null);
    } finally {
      // When async job starts, polling will clear isValidating.
      if (!startedAsyncJob) setIsValidating(false);
    }
  };

  const onAgentSelect = (agent: AgentForPicker) => {
    setAgentId(agent.agent_id);
    setSelectedAgent(agent);
    setDatasetIds([]); // Reset datasets on agent change
    setViewMode("expanded");
  };

  const onMapSelectAgent = (selectedId: string) => {
    const agent = agents.find(a => a.agent_id === selectedId);
    if (agent) onAgentSelect(agent);
  };

  const agentsErrorStatus = Number((agentsError as any)?.response?.status ?? 0);
  const agentsErrorCode = getApiErrorCode(agentsError);
  const showGateLoadingState = agentsLoading && typeof agentsData === "undefined";
  const showGateAccessDeniedState = !!agentsError && agentsErrorStatus === 403;
  const showGateApiErrorState =
    !!agentsError && agentsErrorStatus !== 401 && !showGateAccessDeniedState;
  const showGateEmptyState = false;

  useEffect(() => {
    if (agentsErrorStatus !== 401) return;
    redirectToLogin({
      code: agentsErrorCode,
      message: getApiErrorMessage(agentsError),
    });
  }, [agentsError, agentsErrorCode, agentsErrorStatus]);

  const contextValue: Record<string, unknown> = {
    orgId,
    projectId,
    project,
    tab,
    setTab,
    setViewMode,
    setAgentId,
    setSelectedAgent,
    setDatasetIds,
    setSnapshotIds,
    setRunSnapshotIds,
    setRunDatasetIds,
    setExpandedDatasetId,
    selectedAgent,
    agentsLoaded,
    agents,
    onMapSelectAgent,
    requestSystemPrompt,
    recentSnapshots,
    recentSnapshotsLoading,
    recentSnapshotsError,
    mutateRecentSnapshots,
    baselineSnapshotsById,
    runSnapshotIds,
    setDataSource,
    snapshotEvalFailed,
    setBaselineDetailSnapshot,
    datasets,
    datasetsLoading,
    datasetsError,
    mutateDatasets,
    runDatasetIds,
    expandedDatasetId,
    expandedDatasetSnapshots,
    datasetSnapshotsLoading,
    datasetSnapshotsError,
    datasetSnapshots404,
    mutateDatasetSnapshots,
    expandedDatasetSnapshotsLoading,
    expandedDatasetSnapshotsError,
    expandedDatasetSnapshots404,
    mutateExpandedDatasetSnapshots,
    baselineSeedSnapshot,
    baselinePayload,
    nodeBasePayload,
    finalCandidateRequest,
    baselineConfigSummary,
    validateOverridePreview,
    configSourceLabel,
    selectedBaselineCount,
    selectedDataSummary,
    REPLAY_PROVIDER_MODEL_LIBRARY: replayProviderModelLibrary,
    REPLAY_THRESHOLD_PRESETS,
    thresholdPreset,
    setThresholdPreset,
    normalizeGateThresholds,
    failRateMax,
    setFailRateMax,
    flakyRateMax,
    setFlakyRateMax,
    newModel,
    setNewModel,
    modelOverrideEnabled,
    setModelOverrideEnabled,
    replayProvider,
    setReplayProvider,
    requestBody,
    setRequestBody,
    requestBodyJson,
    requestJsonDraft,
    setRequestJsonDraft,
    requestJsonError,
    handleRequestJsonBlur,
    applySystemPromptToBody,
    toolsList,
    setToolsList,
    repeatRuns,
    setRepeatRuns,
    repeatDropdownOpen,
    setRepeatDropdownOpen,
    repeatDropdownRef,
    REPEAT_OPTIONS,
    isHeavyRepeat,
    canRunValidate,
    keyBlocked,
    keyRegistrationMessage,
    isValidating,
    activeJobId,
    cancelRequested,
    handleValidate,
    handleCancelActiveJob,
    error,
    result,
    expandedCaseIndex,
    setExpandedCaseIndex,
    selectedAttempt,
    setSelectedAttempt,
    baselineDetailSnapshot,
    agentEvalData,
    runEvalElements,
    historyStatus,
    setHistoryStatus,
    historyTraceId,
    setHistoryTraceId,
    historyOffset,
    setHistoryOffset,
    historyLimit,
    historyLoading,
    historyItems,
    historyTotal,
    mutateHistory,
    selectedRunId,
    setSelectedRunId,
    selectedRunReport,
    expandedHistoryId,
    setExpandedHistoryId,
    runDataProvider,
    runDataModel,
    runDataPrompt,
  };
  const liveViewHref =
    orgId && projectId && !isNaN(projectId)
      ? `/organizations/${encodeURIComponent(orgId)}/projects/${projectId}/live-view`
      : "/organizations";
  const rawLayoutChildren = showGateLoadingState
    ? React.createElement(ReleaseGateStatusPanel, {
        title: "Loading Release Gate",
        description: "Fetching agents and release history for this project...",
      })
    : showGateAccessDeniedState
      ? React.createElement(ReleaseGateStatusPanel, {
          title: "Access Denied",
          description:
            "You do not have access to this project. Ask a project owner or admin to update your role before using Release Gate.",
          tone: "warning",
          primaryActionLabel: "Retry",
          onPrimaryAction: () => void mutateAgents(),
        })
      : showGateApiErrorState
        ? React.createElement(ReleaseGateStatusPanel, {
            title: "Unable to Load Release Gate",
            description:
              "We could not reach the Release Gate API right now. Retry in a few seconds. If this keeps happening, check backend health and network connectivity.",
            tone: "danger",
            primaryActionLabel: "Retry",
            onPrimaryAction: () => void mutateAgents(),
          })
        : showGateEmptyState
          ? React.createElement(ReleaseGateStatusPanel, {
              title: "No Baseline Data Yet",
              description: React.createElement(
                "div",
                { className: "space-y-2" },
                React.createElement(
                  "p",
                  null,
                  "Release Gate needs baseline snapshots before it can compare a candidate model."
                ),
                React.createElement(
                  "ol",
                  { className: "list-decimal list-inside space-y-1 text-slate-300" },
                  React.createElement("li", null, "Open Live View and send at least one real or test request."),
                  React.createElement("li", null, "Select baseline snapshots from Live Logs or Saved Data."),
                  React.createElement(
                    "li",
                    null,
                    "Return here to configure candidate overrides and run validation."
                  )
                )
              ),
              tone: "warning",
              primaryActionLabel: "Go to Live View",
              primaryHref: liveViewHref,
            })
          : viewMode === "map"
            ? React.createElement(ReleaseGateMap, {
                agents,
                agentsLoaded,
                onSelectAgent: onMapSelectAgent,
                projectName: project?.name,
              })
            : React.createElement(ReleaseGateExpandedView);
  const layoutChildren = planError
    ? React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "div",
          { className: "px-4 pt-4" },
          React.createElement(PlanLimitBanner, { ...planError, context: "replay" })
        ),
        rawLayoutChildren
      )
    : rawLayoutChildren;
  return React.createElement(
    ReleaseGatePageContext.Provider,
    { value: contextValue },
    React.createElement(
      ReleaseGateLayoutWrapper,
      {
        orgId,
        projectId,
        projectName: project?.name,
        orgName: org?.name,
        onAction: (actionId: string) => {
          console.log("Release Gate HUD Action:", actionId);
        },
      },
      layoutChildren
    )
  );
}
