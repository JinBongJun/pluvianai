"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
  Plus,
  Save,
  RotateCcw,
  Repeat,
  FileCheck,
  FileText,
  Lock,
  CircleHelp,
} from "lucide-react";
import { liveViewAPI, behaviorAPI, type BehaviorRule } from "@/lib/api";
import { PolicyRuleModal } from "@/components/live-view/PolicyRuleModal";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

// Configuration Schema
type EvalConfig = {
  enabled?: boolean;
  empty?: { enabled?: boolean; min_chars?: number };
  latency?: { enabled?: boolean; fail_ms?: number };
  status_code?: { enabled?: boolean; fail_from?: number };
  json?: { enabled?: boolean; mode?: "if_json" | "always" | "off" };
  refusal?: { enabled?: boolean };
  length?: { enabled?: boolean; fail_ratio?: number };
  repetition?: { enabled?: boolean; fail_line_repeats?: number };
  required?: { enabled?: boolean; keywords_csv?: string; json_fields_csv?: string };
  format?: { enabled?: boolean; sections_csv?: string };
  leakage?: { enabled?: boolean };
  tool_use_policy?: { enabled?: boolean }; // behavior rules (tool order/allowlist/forbidden)
};

const DEFAULT_EVAL: Required<EvalConfig> = {
  enabled: true,
  empty: { enabled: true, min_chars: 16 },
  latency: { enabled: true, fail_ms: 5000 },
  status_code: { enabled: true, fail_from: 500 },
  json: { enabled: true, mode: "if_json" },
  refusal: { enabled: true },
  length: { enabled: false, fail_ratio: 0.75 },
  repetition: { enabled: false, fail_line_repeats: 6 },
  required: { enabled: false, keywords_csv: "", json_fields_csv: "" },
  format: { enabled: false, sections_csv: "" },
  leakage: { enabled: false },
  tool_use_policy: { enabled: true },
};

// --- Helpers ---

function normalizeEvalConfig(input?: Partial<EvalConfig> | null): Required<EvalConfig> {
  const cfg = (input || {}) as Partial<EvalConfig>;
  return {
    enabled: cfg.enabled ?? DEFAULT_EVAL.enabled,
    empty: { ...DEFAULT_EVAL.empty, ...(cfg.empty || {}) },
    latency: { ...DEFAULT_EVAL.latency, ...(cfg.latency || {}) },
    status_code: { ...DEFAULT_EVAL.status_code, ...(cfg.status_code || {}) },
    json: { ...DEFAULT_EVAL.json, ...(cfg.json || {}) },
    refusal: { ...DEFAULT_EVAL.refusal, ...(cfg.refusal || {}) },
    length: { ...DEFAULT_EVAL.length, ...(cfg.length || {}) },
    repetition: { ...DEFAULT_EVAL.repetition, ...(cfg.repetition || {}) },
    required: { ...DEFAULT_EVAL.required, ...(cfg.required || {}) },
    format: { ...DEFAULT_EVAL.format, ...(cfg.format || {}) },
    leakage: { ...DEFAULT_EVAL.leakage, ...(cfg.leakage || {}) },
    tool_use_policy: { ...DEFAULT_EVAL.tool_use_policy, ...(cfg.tool_use_policy || {}) },
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** One-line summary of saved config for a rule (shown when enabled). */
function getEvalRuleSummary(id: string, config: any): string {
  if (!config || config.enabled === false) return "";
  switch (id) {
    case "empty":
      return typeof config.min_chars === "number" ? `min ${config.min_chars} chars` : "";
    case "latency": {
      const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);
      const f = config.fail_ms;
      return typeof f === "number" ? `fail ≥ ${fmt(f)}` : "";
    }
    case "status_code": {
      const f = config.fail_from;
      return typeof f === "number" ? `fail ≥${f}` : "";
    }
    case "json":
      return config.mode === "always"
        ? "always enforce"
        : config.mode === "if_json"
          ? "auto-detect"
          : "";
    case "refusal":
      return "On";
    case "length": {
      const fr = config.fail_ratio;
      const pct = (r: number) => `${Math.round(r * 100)}%`;
      return typeof fr === "number" ? `fail ±${pct(fr)} vs baseline` : "";
    }
    case "repetition": {
      const f = config.fail_line_repeats;
      return typeof f === "number" ? `fail ≥ ${f} repeats` : "";
    }
    case "required":
      return config.keywords_csv?.trim() || config.json_fields_csv?.trim()
        ? "keywords/fields set"
        : "On";
    case "format":
      return config.sections_csv?.trim() ? "sections set" : "On";
    case "leakage":
      return "On";
    default:
      return "";
  }
}

// --- Components ---

interface SignalCardProps {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  config: any;
  onUpdate: (newConfig: any) => void;
  renderSettings: (config: any, update: (c: any) => void) => React.ReactNode;
  /** One-line summary of saved config (e.g. "min 16 chars"). Shown when enabled. */
  summary?: string;
}

const SignalCard: React.FC<SignalCardProps> = ({
  id,
  label,
  icon: Icon,
  config,
  onUpdate,
  renderSettings,
  summary,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isEnabled = config?.enabled !== false;

  const statusColor = useMemo(() => {
    if (!isEnabled) return "text-slate-500";
    return "text-emerald-400";
  }, [isEnabled]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({ ...config, enabled: !isEnabled });
  };

  return (
    <div
      className={clsx(
        "border-b border-white/5 last:border-0 transition-colors duration-200 overflow-hidden",
        isExpanded ? "bg-white/[0.02]" : "hover:bg-white/[0.01]"
      )}
    >
      <div
        className="px-6 py-4 flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div
            className={clsx(
              "p-2 rounded-lg bg-black/40 border border-white/5 shadow-sm",
              statusColor
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "text-sm font-medium tracking-wide",
                  isEnabled ? "text-slate-200" : "text-slate-400"
                )}
              >
                {label}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {isEnabled
                ? summary
                  ? `${summary} · click to configure`
                  : "Enabled · click to configure"
                : "Disabled"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div
            role="button"
            onClick={handleToggle}
            className={clsx(
              "w-9 h-5 rounded-full transition-colors relative flex items-center",
              isEnabled ? "bg-emerald-500" : "bg-white/10"
            )}
          >
            <div
              className={clsx(
                "w-4 h-4 rounded-full bg-white shadow-sm absolute transition-transform",
                isEnabled ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div
              className={clsx(
                "px-6 pb-6 pt-2 pl-[4.5rem] space-y-4",
                !isEnabled && "pointer-events-none opacity-60"
              )}
              aria-disabled={!isEnabled}
            >
              {renderSettings(config, onUpdate)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

type RuleScope = "project" | "agent";

function PolicyRuleList({ rules, emptyMessage }: { rules: BehaviorRule[]; emptyMessage: string }) {
  if (rules.length === 0) {
    return <div className="px-4 py-6 text-sm text-slate-500 italic">{emptyMessage}</div>;
  }
  return (
    <div className="divide-y divide-white/5">
      {rules.map(rule => (
        <div
          key={rule.id}
          className="px-4 py-3 hover:bg-white/[0.02] transition-colors duration-200"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-200 truncate">{rule.name}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white/5 px-2 py-0.5 rounded">
              {rule.rule_json?.type}
            </div>
          </div>
          {rule.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              {rule.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Main Panel ---

export function AgentEvaluationPanel({
  projectId,
  agentId,
  embedded,
  onSaveSuccess,
  onSaveStart,
  onSaveEnd,
  onDirtyChange,
  disabled,
}: {
  projectId: number;
  agentId: string;
  embedded?: boolean;
  onSaveSuccess?: () => void;
  /** Called when save request starts (Validate button can be disabled). */
  onSaveStart?: () => void;
  /** Called when save request finishes (success or error). */
  onSaveEnd?: () => void;
  /** Notifies parent whether eval settings have unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
  /** When true, panel is read-only (e.g. while a test is running). No toggles or Save. */
  disabled?: boolean;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  // Same SWR key as ClinicalLog so saving here updates the log view immediately (shared cache).
  const { data: settingsData, mutate: mutateSettings } = useSWR(
    projectId && agentId ? ["agent-log-settings", projectId, agentId] : null,
    () => liveViewAPI.getAgentSettings(projectId, agentId)
  );

  const [draft, setDraft] = useState<Required<EvalConfig> | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showToolPolicyDetails, setShowToolPolicyDetails] = useState(false);
  const lastAgentIdRef = useRef<string | null>(null);

  // Tool use policy (behavior rules) — evaluation element
  const { data: projectRulesData, mutate: mutateProjectRules } = useSWR(
    projectId ? ["policy-rules-project", projectId] : null,
    () => behaviorAPI.listRules(projectId, { enabled: true, scope_type: "project" })
  );
  const { data: agentRulesData, mutate: mutateAgentRules } = useSWR(
    projectId && agentId ? ["policy-rules-agent", projectId, agentId] : null,
    () =>
      behaviorAPI.listRules(projectId, { enabled: true, scope_type: "agent", scope_ref: agentId })
  );
  const projectRules = useMemo(
    () => (Array.isArray(projectRulesData) ? projectRulesData : []),
    [projectRulesData]
  );
  const agentRules = useMemo(
    () => (Array.isArray(agentRulesData) ? agentRulesData : []),
    [agentRulesData]
  );
  const [policyModalScope, setPolicyModalScope] = useState<RuleScope | null>(null);
  const [policyActionStatus, setPolicyActionStatus] = useState("");
  const handleCreatePolicyRule = async (
    payload: Omit<BehaviorRule, "id" | "created_at" | "updated_at" | "project_id">
  ) => {
    await behaviorAPI.createRule(projectId, payload);
    await Promise.all([mutateProjectRules(), mutateAgentRules()]);
    await globalMutate(
      k => Array.isArray(k) && k[0] === "policy-rules-project" && k[1] === projectId
    );
    await globalMutate(
      k =>
        Array.isArray(k) && k[0] === "policy-rules-agent" && k[1] === projectId && k[2] === agentId
    );
    setPolicyActionStatus(
      payload.scope_type === "project" ? "Project rule created." : "Agent override created."
    );
  };

  // Load initial settings
  const evalConfig: Required<EvalConfig> = useMemo(() => {
    const configuredEval = (settingsData?.diagnostic_config?.eval ||
      null) as Partial<EvalConfig> | null;
    return normalizeEvalConfig(configuredEval);
  }, [settingsData]);
  // Initialize / reset draft when data loads or agent changes.
  useEffect(() => {
    if (!settingsData) return;
    const normalized = normalizeEvalConfig(evalConfig);
    const lastAgentId = lastAgentIdRef.current;
    if (!draft || lastAgentId !== agentId) {
      setDraft(JSON.parse(JSON.stringify(normalized)));
      setSaveStatus("idle");
      setSaveError(null);
    }
    lastAgentIdRef.current = agentId;
  }, [agentId, evalConfig, settingsData, draft]);

  // Handle Updates
  const updateConfig = (section: keyof EvalConfig, newData: any) => {
    if (!draft) return;
    setDraft({ ...draft, [section]: newData });
    setSaveStatus("idle");
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    const payload = normalizeEvalConfig(draft);
    // Validate required fields when a rule is enabled
    if (payload.required?.enabled) {
      const kw = (payload.required.keywords_csv ?? "").trim();
      const jf = (payload.required.json_fields_csv ?? "").trim();
      if (!kw && !jf) {
        setSaveError("Required Keywords/Fields is on but both fields are empty. Add at least one.");
        setSaveStatus("error");
        return;
      }
    }
    if (payload.format?.enabled) {
      const sec = (payload.format.sections_csv ?? "").trim();
      if (!sec) {
        setSaveError("Format Contract is on but Required Sections is empty.");
        setSaveStatus("error");
        return;
      }
    }
    setSaveError(null);
    setSaveStatus("saving");
    onSaveStart?.();
    try {
      await liveViewAPI.updateAgentSettings(projectId, agentId, {
        diagnostic_config: { eval: payload },
      });
      await mutateSettings();
      // Invalidate eval runtime so Clinical Log refetches pass/fail with new config.
      await globalMutate(
        k =>
          Array.isArray(k) &&
          k[0] === "agent-eval-runtime" &&
          k[1] === projectId &&
          k[2] === agentId
      );
      // Invalidate agent display settings so Release Gate and other views see the updated eval config.
      await globalMutate(
        k =>
          Array.isArray(k) &&
          k[0] === "agent-log-settings" &&
          k[1] === projectId &&
          k[2] === agentId
      );
      onSaveSuccess?.();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus("error");
      setSaveError("Save failed. Try again.");
    } finally {
      onSaveEnd?.();
    }
  };

  const handleReset = () => {
    setDraft(JSON.parse(JSON.stringify(normalizeEvalConfig(evalConfig))));
    setSaveStatus("idle");
    setSaveError(null);
  };

  const safeDraft = draft ? normalizeEvalConfig(draft) : null;
  const isDirty = safeDraft ? JSON.stringify(safeDraft) !== JSON.stringify(evalConfig) : false;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  if (!safeDraft)
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
        <div className="h-8 w-32 rounded-lg bg-white/10 animate-pulse" aria-hidden />
        <div className="h-4 w-48 rounded bg-white/5 animate-pulse" aria-hidden />
        <div className="h-4 w-40 rounded bg-white/5 animate-pulse" aria-hidden />
        <Clock className="w-6 h-6 text-slate-600 animate-pulse mt-2" aria-hidden />
      </div>
    );

  const InputCls =
    "w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/50 transition-colors placeholder:text-slate-600 font-mono";
  const LabelCls = "text-xs font-bold uppercase tracking-widest text-slate-400";
  const HintCls = "text-xs text-slate-500 mt-1.5";
  const FieldLabel = ({ label, help }: { label: string; help: string }) => (
    <div className="mb-2 flex items-center gap-2">
      <span className={LabelCls}>{label}</span>
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-700 text-slate-400 hover:text-white hover:border-emerald-400/40 cursor-help transition-colors"
        title={help}
        aria-label={help}
      >
        <CircleHelp className="w-3.5 h-3.5" />
      </span>
    </div>
  );

  return (
    <div
      className={clsx(
        "relative flex min-h-0 flex-col text-slate-200",
        embedded ? "bg-transparent" : "h-0 flex-1 bg-[#0a0f1e]/20",
        disabled && "pointer-events-none select-none opacity-70"
      )}
      aria-busy={disabled}
    >
      {disabled && (
        <div
          className="absolute inset-0 z-10 rounded-xl bg-black/20 flex items-center justify-center"
          aria-hidden
        >
          <span className="text-xs font-medium text-slate-400">
            Test running — changes disabled
          </span>
        </div>
      )}
      <PolicyRuleModal
        isOpen={policyModalScope !== null}
        initialScopeType={policyModalScope || "project"}
        agentId={agentId}
        onClose={() => setPolicyModalScope(null)}
        onSave={handleCreatePolicyRule}
      />

      {embedded && (
        <>
          <div className="flex items-center justify-end gap-2 mb-3">
            {isDirty && (
              <button
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Reset Changes"
              >
                Reset
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving" || !isDirty}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                saveStatus === "saved"
                  ? "bg-emerald-500 text-black"
                  : saveStatus === "saving"
                    ? "bg-emerald-500/50 text-white cursor-wait"
                    : isDirty
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "bg-white/5 text-slate-500 cursor-not-allowed"
              )}
            >
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Save"}
            </button>
          </div>
          {saveStatus === "saved" && (
            <p className="text-[11px] text-emerald-400/90 mb-2" role="status">
              Saved. These rules will apply to the next re-evaluation.
            </p>
          )}
          {saveError && (
            <p className="text-[11px] text-rose-400/90 mb-2" role="alert">
              {saveError}
            </p>
          )}
        </>
      )}

      {!embedded && (
        <>
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20 backdrop-blur-sm sticky top-0 z-10">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-black text-white uppercase tracking-widest">Evaluation</h2>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Configure evaluation rules. Log range is managed in Live Logs.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isDirty && (
                <button
                  onClick={handleReset}
                  className="p-2.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                  title="Reset Changes"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saveStatus === "saving" || !isDirty}
                className={clsx(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  saveStatus === "saved"
                    ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    : saveStatus === "saving"
                      ? "bg-emerald-500/50 text-white cursor-wait"
                      : isDirty
                        ? "bg-emerald-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:bg-emerald-500"
                        : "bg-white/5 text-slate-500"
                )}
              >
                {saveStatus === "saving" ? (
                  <Clock className="w-4 h-4 animate-spin" />
                ) : saveStatus === "saved" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saveStatus === "saved" ? "Saved" : "Save Changes"}
              </button>
            </div>
          </div>
          {saveError && (
            <p
              className="px-6 py-2 text-xs text-rose-400/90 bg-rose-500/10 border-b border-rose-500/20"
              role="alert"
            >
              {saveError}
            </p>
          )}
        </>
      )}

      {/* Signal List Container */}
      <div
        className={clsx(
          "min-h-0 overflow-y-auto custom-scrollbar",
          embedded ? "max-h-[min(64rem,70vh)]" : "flex-1 p-6"
        )}
      >
        <div className="max-w-4xl mx-auto rounded-xl border border-white/10 bg-black/20 overflow-hidden shadow-2xl">
          {/* 1. Empty Answers */}
          <SignalCard
            id="empty"
            label="Empty / Short Answers"
            icon={AlertTriangle}
            config={safeDraft.empty}
            onUpdate={c => updateConfig("empty", c)}
            summary={getEvalRuleSummary("empty", safeDraft.empty)}
            renderSettings={(cfg, update) => (
              <div>
                <FieldLabel
                  label="Minimum Characters"
                  help="Minimum response length. If response is shorter than this, it is considered too short."
                />
                <input
                  type="number"
                  min={1}
                  max={10000}
                  className={InputCls}
                  value={cfg.min_chars}
                  onChange={e =>
                    update({ ...cfg, min_chars: clampNumber(Number(e.target.value), 1, 10000) })
                  }
                />
                <p className={HintCls}>Range: 1 to 10,000</p>
              </div>
            )}
          />

          {/* 2. Latency */}
          <SignalCard
            id="latency"
            label="Latency Spikes"
            icon={Clock}
            config={safeDraft.latency}
            onUpdate={c => updateConfig("latency", c)}
            summary={getEvalRuleSummary("latency", safeDraft.latency)}
            renderSettings={(cfg, update) => (
              <div>
                <FieldLabel
                  label="Fail Threshold (ms)"
                  help="If latency is at or above this value, the check fails. Use your normal p99 as a starting point."
                />
                <input
                  type="number"
                  min={100}
                  max={180000}
                  className={InputCls}
                  value={cfg.fail_ms}
                  onChange={e =>
                    update({ ...cfg, fail_ms: clampNumber(Number(e.target.value), 100, 180000) })
                  }
                />
                <p className={HintCls}>Range: 100 to 180,000 ms</p>
              </div>
            )}
          />

          {/* 3. HTTP Errors */}
          <SignalCard
            id="status_code"
            label="HTTP Error Codes"
            icon={XCircle}
            config={safeDraft.status_code}
            onUpdate={c => updateConfig("status_code", c)}
            summary={getEvalRuleSummary("status_code", safeDraft.status_code)}
            renderSettings={(cfg, update) => (
              <div>
                <FieldLabel
                  label="Fail From"
                  help="HTTP status code at or above this value fails the check. Common default is 500."
                />
                <input
                  type="number"
                  min={100}
                  max={599}
                  className={InputCls}
                  value={cfg.fail_from}
                  onChange={e =>
                    update({ ...cfg, fail_from: clampNumber(Number(e.target.value), 100, 599) })
                  }
                />
                <p className={HintCls}>Range: 100 to 599</p>
              </div>
            )}
          />

          {/* 4. JSON Validity */}
          <SignalCard
            id="json"
            label="JSON Validity"
            icon={Code2}
            config={safeDraft.json}
            onUpdate={c => updateConfig("json", c)}
            summary={getEvalRuleSummary("json", safeDraft.json)}
            renderSettings={(cfg, update) => (
              <div>
                <FieldLabel
                  label="Mode"
                  help="if_json: only validate when output looks like JSON. always: always enforce JSON validity."
                />
                <select
                  className={InputCls}
                  value={cfg.mode}
                  onChange={e => update({ ...cfg, mode: e.target.value })}
                >
                  <option value="if_json" className="bg-[#0a0f1e] text-slate-200">
                    Auto-detect
                  </option>
                  <option value="always" className="bg-[#0a0f1e] text-slate-200">
                    Always Enforce
                  </option>
                </select>
              </div>
            )}
          />

          {/* 5. Required Fields */}
          <SignalCard
            id="required"
            label="Required Keywords / Fields"
            icon={FileCheck}
            config={safeDraft.required}
            onUpdate={c => updateConfig("required", c)}
            summary={getEvalRuleSummary("required", safeDraft.required)}
            renderSettings={(cfg, update) => (
              <div className="space-y-3">
                <div>
                  <FieldLabel
                    label="Keywords (CSV)"
                    help="Comma-separated keywords that must appear in the response."
                  />
                  <input
                    type="text"
                    className={InputCls}
                    value={cfg.keywords_csv}
                    onChange={e => update({ ...cfg, keywords_csv: e.target.value })}
                    placeholder="error, failed, exception..."
                  />
                </div>
                <div>
                  <FieldLabel
                    label="JSON Fields (CSV)"
                    help="Comma-separated JSON fields that must exist when output is JSON."
                  />
                  <input
                    type="text"
                    className={InputCls}
                    value={cfg.json_fields_csv}
                    onChange={e => update({ ...cfg, json_fields_csv: e.target.value })}
                    placeholder="id, status, result..."
                  />
                </div>
              </div>
            )}
          />

          {/* 6. Tool use policy (behavior rules) */}
          <div className="border-b border-white/5 last:border-0 overflow-hidden transition-opacity duration-200">
            <div
              className="px-6 py-4 flex items-center justify-between bg-white/[0.01] cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => setShowToolPolicyDetails(prev => !prev)}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div
                  className={clsx(
                    "p-2 rounded-lg bg-black/40 border border-white/5 shadow-sm shrink-0",
                    safeDraft.tool_use_policy?.enabled !== false
                      ? "text-emerald-400"
                      : "text-slate-500"
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span
                    className={clsx(
                      "text-sm font-medium tracking-wide",
                      safeDraft.tool_use_policy?.enabled !== false
                        ? "text-slate-200"
                        : "text-slate-400"
                    )}
                  >
                    Tool use policy
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[11px] text-slate-500 font-mono">
                      {safeDraft.tool_use_policy?.enabled !== false
                        ? `Project: ${projectRules.length} · Agent: ${agentRules.length}`
                        : "Disabled"}
                    </p>
                    {safeDraft.tool_use_policy?.enabled !== false && (
                      <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors">
                        {showToolPolicyDetails ? "Hide details" : "Show details"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div
                role="button"
                onClick={e => {
                  e.stopPropagation();
                  updateConfig("tool_use_policy", {
                    ...safeDraft.tool_use_policy,
                    enabled: safeDraft.tool_use_policy?.enabled === false,
                  });
                }}
                className={clsx(
                  "w-9 h-5 rounded-full transition-colors relative flex items-center shrink-0 ml-4 cursor-pointer",
                  safeDraft.tool_use_policy?.enabled !== false ? "bg-emerald-500" : "bg-white/10"
                )}
              >
                <div
                  className={clsx(
                    "w-4 h-4 rounded-full bg-white shadow-sm absolute transition-transform",
                    safeDraft.tool_use_policy?.enabled !== false
                      ? "translate-x-4"
                      : "translate-x-0.5"
                  )}
                />
              </div>
            </div>
            {showToolPolicyDetails && (
              <div
                className={clsx(
                  "transition-opacity duration-200",
                  safeDraft.tool_use_policy?.enabled === false && "opacity-60"
                )}
              >
                <div
                  className={clsx(
                    "px-6 pb-6 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-4",
                    safeDraft.tool_use_policy?.enabled === false && "pointer-events-none"
                  )}
                >
                  <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 p-3 border-b border-white/5">
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                        Project defaults
                      </span>
                      <button
                        onClick={() => setPolicyModalScope("project")}
                        className="px-2 py-1 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-black uppercase text-slate-300 hover:bg-white/10 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> New
                      </button>
                    </div>
                    <PolicyRuleList rules={projectRules} emptyMessage="No project rules yet." />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 p-3 border-b border-white/5">
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                        Agent overrides
                      </span>
                      <button
                        onClick={() => setPolicyModalScope("agent")}
                        className="px-2 py-1 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-black uppercase text-slate-300 hover:bg-white/10 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> New
                      </button>
                    </div>
                    <PolicyRuleList rules={agentRules} emptyMessage="No agent overrides yet." />
                  </div>
                </div>
                {policyActionStatus && (
                  <div className="px-6 pb-4 text-xs text-emerald-400">{policyActionStatus}</div>
                )}
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-y border-white/5 bg-white/[0.015]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  Advanced checks
                </p>
                <p className="text-[11px] text-slate-500">
                  Optional checks for stricter monitoring. Keep collapsed for simpler setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvanced(prev => !prev)}
                className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-bold text-slate-300 hover:bg-white/10 transition-colors"
              >
                {showAdvanced ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {showAdvanced && (
            <>
              {/* Refusal */}
              <SignalCard
                id="refusal"
                label="Refusal / Non-Answer"
                icon={ShieldAlert}
                config={safeDraft.refusal}
                onUpdate={c => updateConfig("refusal", c)}
                summary={getEvalRuleSummary("refusal", safeDraft.refusal)}
                renderSettings={(cfg, update) => (
                  <div className="space-y-2">
                    <FieldLabel
                      label="Detection Logic"
                      help="Built-in refusal patterns (e.g., 'I cannot', 'as an AI') are checked automatically."
                    />
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-emerald-400 font-medium">
                        Built-in patterns active.
                      </p>
                    </div>
                    <p className={HintCls}>
                      No numeric threshold. Recommended: keep ON for customer-facing agents.
                    </p>
                  </div>
                )}
              />

              {/* Output Length Drift */}
              <SignalCard
                id="length"
                label="Output Length Drift"
                icon={SlidersHorizontal}
                config={safeDraft.length}
                onUpdate={c => updateConfig("length", c)}
                summary={getEvalRuleSummary("length", safeDraft.length)}
                renderSettings={(cfg, update) => (
                  <div>
                    <FieldLabel
                      label="Fail ratio"
                      help="Relative output-length change from baseline that fails. Example: 0.75 means 75% drift."
                    />
                    <input
                      type="number"
                      min={0}
                      max={3}
                      step="0.05"
                      className={InputCls}
                      value={cfg.fail_ratio}
                      onChange={e =>
                        update({ ...cfg, fail_ratio: clampNumber(Number(e.target.value), 0, 3) })
                      }
                    />
                    <p className={HintCls}>Range: 0.00 to 3.00</p>
                  </div>
                )}
              />

              {/* Repetition */}
              <SignalCard
                id="repetition"
                label="Repetition / Loops"
                icon={Repeat}
                config={safeDraft.repetition}
                onUpdate={c => updateConfig("repetition", c)}
                summary={getEvalRuleSummary("repetition", safeDraft.repetition)}
                renderSettings={(cfg, update) => (
                  <div>
                    <FieldLabel
                      label="Fail repeats"
                      help="Number of repeated lines that fails the repetition check."
                    />
                    <input
                      type="number"
                      min={1}
                      max={150}
                      className={InputCls}
                      value={cfg.fail_line_repeats}
                      onChange={e =>
                        update({
                          ...cfg,
                          fail_line_repeats: clampNumber(Number(e.target.value), 1, 150),
                        })
                      }
                    />
                    <p className={HintCls}>Range: 1 to 150</p>
                  </div>
                )}
              />

              {/* Format Contract */}
              <SignalCard
                id="format"
                label="Format Contract"
                icon={FileText}
                config={safeDraft.format}
                onUpdate={c => updateConfig("format", c)}
                summary={getEvalRuleSummary("format", safeDraft.format)}
                renderSettings={(cfg, update) => (
                  <div>
                    <FieldLabel
                      label="Required Sections (CSV)"
                      help="Comma-separated section names or phrases that must appear in each response."
                    />
                    <input
                      type="text"
                      className={InputCls}
                      value={cfg.sections_csv}
                      onChange={e => update({ ...cfg, sections_csv: e.target.value })}
                      placeholder="summary, conclusion, references..."
                    />
                  </div>
                )}
              />

              {/* PII Leakage */}
              <SignalCard
                id="leakage"
                label="PII Leakage Shield"
                icon={Lock}
                config={safeDraft.leakage}
                onUpdate={c => updateConfig("leakage", c)}
                summary={getEvalRuleSummary("leakage", safeDraft.leakage)}
                renderSettings={(cfg, update) => (
                  <div className="space-y-2">
                    <FieldLabel
                      label="Detection Logic"
                      help="Regex-based checks for common leakage patterns (email, phone, API keys)."
                    />
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-emerald-400 font-medium">
                        Email, Phone, API Key patterns are actively monitored.
                      </p>
                    </div>
                    <p className={HintCls}>
                      No numeric threshold. Recommended: ON for production traffic.
                    </p>
                  </div>
                )}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
