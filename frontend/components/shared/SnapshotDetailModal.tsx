'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlignLeft,
  CheckCircle2,
  Coins,
  Hash,
  Scale,
  ShieldCheck,
  Terminal,
  Wrench,
  XCircle,
  Zap,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';

export interface SnapshotForDetail {
  id: string | number;
  trace_id?: string;
  agent_id?: string;
  created_at?: string;
  latency_ms?: number | null;
  tokens_used?: number | null;
  cost?: number | string | null;
  system_prompt?: string | null;
  user_message?: string | null;
  request_prompt?: string | null;
  response?: string | null;
  response_text?: string | null;
  payload?: Record<string, unknown> | null;
  status_code?: number | null;
  has_tool_calls?: boolean;
  tool_calls_summary?: Array<{ name: string; arguments?: string | Record<string, unknown> }>;
}

export type PolicyState = {
  status: 'idle' | 'loading' | 'pass' | 'fail' | 'error';
  message?: string;
};

export interface EvalRow {
  id: string;
  status: string;
}

export interface EvalResultOverride {
  policyStatus?: string;
  evalRows?: EvalRow[];
}

const EVAL_CHECK_LABELS: Record<string, string> = {
  empty: 'Empty / Short Answers',
  latency: 'Latency Spikes',
  status_code: 'HTTP Error Codes',
  refusal: 'Refusal / Non-Answer',
  json: 'JSON Validity',
  length: 'Output Length Drift',
  repetition: 'Repetition / Loops',
  required: 'Required Keywords / Fields',
  format: 'Format Contract',
  tokens: 'Token Usage Spikes',
  cost: 'High Cost Alert',
  leakage: 'PII Leakage Shield',
  coherence: 'Reasoning Coherence',
  tool: 'Tool Use Policy',
};

function formatPrettyTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString('en-US')} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}`;
}

function safeStringify(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function extractStepLogs(
  snapshot: SnapshotForDetail
): Array<{ name: string; status: string; runtimeMs?: number; detail?: string }> {
  const payload = (snapshot.payload || {}) as Record<string, unknown>;
  const candidates = [payload.steps, payload.step_log, (payload.trajectory as any)?.steps, payload.events];
  const raw = candidates.find((c) => Array.isArray(c));
  if (!Array.isArray(raw)) return [];
  const MAX = 30;
  return raw.slice(0, MAX).map((step: any, idx: number) => {
    if (typeof step === 'string') {
      return { name: `step_${idx + 1}`, status: 'unknown', detail: step };
    }
    const name = String(
      step?.name ?? step?.id ?? step?.tool ?? step?.type ?? step?.action ?? `step_${idx + 1}`
    );
    const status = String(
      step?.status ??
        step?.state ??
        step?.result ??
        (step?.ok === false ? 'fail' : step?.ok === true ? 'pass' : 'unknown')
    ).toLowerCase();
    const runtimeMs =
      typeof step?.runtime_ms === 'number'
        ? step.runtime_ms
        : typeof step?.duration_ms === 'number'
          ? step.duration_ms
          : typeof step?.latency_ms === 'number'
            ? step.latency_ms
            : undefined;
    const detailValue = step?.detail ?? step?.message ?? step?.output ?? step?.summary;
    const detail =
      typeof detailValue === 'string' ? detailValue : detailValue != null ? JSON.stringify(detailValue) : undefined;
    return { name, status, runtimeMs, detail };
  });
}

function getEvalDetail(
  s: SnapshotForDetail,
  checkId: string,
  savedEvalConfig: Record<string, unknown>
): { actualStr: string; configStr: string } {
  const cfg = (savedEvalConfig[checkId] || {}) as Record<string, unknown>;
  const res = String((s.response_text ?? s.response ?? '') || '').trim();
  const len = res.length;
  let configStr = '—';
  switch (checkId) {
    case 'empty': {
      const minChars = Number(cfg?.min_chars) ?? 16;
      configStr = `min ${minChars} chars`;
      return { actualStr: `${len} chars`, configStr };
    }
    case 'latency': {
      const warn = Number(cfg?.warn_ms) ?? 2000;
      const crit = Number(cfg?.crit_ms) ?? 5000;
      configStr = `warn > ${warn}ms, crit > ${crit}ms`;
      const ms = s.latency_ms ?? 0;
      return { actualStr: `${ms}ms`, configStr };
    }
    case 'status_code': {
      const warnFrom = Number(cfg?.warn_from) ?? 400;
      const critFrom = Number(cfg?.crit_from) ?? 500;
      configStr = `warn ≥ ${warnFrom}, crit ≥ ${critFrom}`;
      const code = s.status_code ?? 200;
      return { actualStr: String(code), configStr };
    }
    case 'length':
    case 'repetition':
      configStr = '—';
      return { actualStr: '—', configStr };
    case 'tokens': {
      const warn = Number(cfg?.warn) ?? 4000;
      configStr = `warn > ${warn}`;
      return { actualStr: String(s.tokens_used ?? '—'), configStr };
    }
    case 'cost': {
      const warn = Number(cfg?.warn) ?? 0.5;
      configStr = `warn > ${warn}`;
      return { actualStr: String(s.cost ?? '—'), configStr };
    }
    default:
      return { actualStr: '—', configStr: '—' };
  }
}

function extractCustomCode(snapshot: SnapshotForDetail): string | null {
  const payload = (snapshot.payload || {}) as Record<string, unknown>;
  const maybeCode =
    payload.custom_code ??
    payload.code ??
    payload.script ??
    (payload.agent_config as any)?.custom_code ??
    (payload.agent_config as any)?.script;
  if (typeof maybeCode === 'string' && maybeCode.trim()) return maybeCode.trim();
  if (maybeCode != null && typeof maybeCode === 'object') {
    try {
      return JSON.stringify(maybeCode, null, 2);
    } catch {
      return String(maybeCode);
    }
  }
  return null;
}

export interface SnapshotDetailModalProps {
  snapshot: SnapshotForDetail;
  onClose: () => void;
  policyState?: PolicyState | null;
  evalRows?: EvalRow[];
  savedEvalConfig?: Record<string, unknown>;
  evalEnabled?: boolean;
  /** When set (e.g. from Drift right panel), overrides Evaluation & Policy section */
  evalResultOverride?: EvalResultOverride | null;
  /** Optional note for eval section (e.g. "Eval result from snapshot capture time.") */
  evalContextLabel?: string | null;
}

export function SnapshotDetailModal({
  snapshot: s,
  onClose,
  policyState = { status: 'idle' },
  evalRows = [],
  savedEvalConfig = {},
  evalEnabled = false,
  evalResultOverride = null,
  evalContextLabel = null,
}: SnapshotDetailModalProps) {
  const stepLogs = extractStepLogs(s);
  const customCode = extractCustomCode(s);

  const useOverride = !!evalResultOverride;
  const displayPolicyStatus = useOverride ? evalResultOverride?.policyStatus ?? '—' : policyState?.status ?? 'idle';
  const displayEvalRows = useOverride ? evalResultOverride?.evalRows ?? [] : evalRows;
  const effectiveEvalEnabled = useOverride ? displayEvalRows.length > 0 : evalEnabled;

  const failedCount = displayEvalRows.filter((r) => r.status === 'fail').length;
  const passedCount = displayEvalRows.filter((r) => r.status === 'pass').length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.96, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 15 }}
        className="relative w-full max-w-5xl max-h-[90vh] bg-[#111216] border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between px-8 py-5 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-widest">Snapshot Details</h3>
              <p className="text-xs text-slate-400 font-medium tracking-wide mt-0.5">
                {formatPrettyTime(s.created_at as string)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors group"
          >
            <XCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar">
          <div className="bg-[#030806] p-6 rounded-[24px] mb-10 shadow-inner shrink-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <Activity className="w-6 h-6 text-blue-500 mb-1" />
                <span className="text-sm font-medium text-slate-400">Status</span>
                <span
                  className={clsx(
                    'text-lg font-black uppercase tracking-wider',
                    failedCount === 0
                      ? 'text-emerald-400'
                      : passedCount > 0 && failedCount > 0
                        ? 'text-amber-500'
                        : 'text-rose-400'
                  )}
                >
                  {failedCount === 0 ? 'PASS' : passedCount > 0 && failedCount > 0 ? 'PARTIAL' : 'FAIL'}
                </span>
              </div>
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <Zap className="w-6 h-6 text-amber-500 mb-1" />
                <span className="text-sm font-medium text-slate-400">Latency</span>
                <span className="text-lg font-black text-slate-200">{s.latency_ms != null ? `${s.latency_ms}ms` : '—'}</span>
              </div>
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <Hash className="w-6 h-6 text-emerald-500 mb-1" />
                <span className="text-sm font-medium text-slate-400">Tokens</span>
                <span className="text-lg font-black text-slate-200">{s.tokens_used ?? '—'}</span>
              </div>
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <Coins className="w-6 h-6 text-emerald-500 mb-1" />
                <span className="text-sm font-medium text-slate-400">Cost</span>
                <span className="text-lg font-black text-slate-200">{s.cost ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-12 shrink-0">
            <div className="space-y-8">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <AlignLeft className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">System Prompt</span>
                </div>
                <div className="bg-[#030806] border border-white/5 rounded-[20px] p-6 text-sm text-slate-400 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
                  {safeStringify(s.system_prompt)}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <AlignLeft className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">User Input</span>
                </div>
                <div className="bg-[#030806] border border-white/5 rounded-[20px] p-6 text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
                  {safeStringify(s.request_prompt ?? s.user_message)}
                </div>
              </div>

              {(s.has_tool_calls || (Array.isArray(s.tool_calls_summary) && s.tool_calls_summary.length > 0)) && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <Wrench className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">Tool calls</span>
                  </div>
                  <div className="bg-[#030806] border border-white/5 rounded-[20px] p-6 shadow-inner space-y-4">
                    {(s.tool_calls_summary || []).map((tc, idx) => (
                      <div key={idx} className="border border-white/5 rounded-xl p-4 bg-[#0a0a0c]">
                        <div className="text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-2">{tc.name}</div>
                        <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
                          {typeof tc.arguments === 'string' ? tc.arguments : safeStringify(tc.arguments)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {customCode && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Custom Code</span>
                  </div>
                  <div className="bg-[#030806] border border-emerald-500/10 rounded-[20px] p-6 text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
                    {customCode}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <AlignLeft className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Agent Response</span>
                </div>
                <div className="bg-[#022c22]/20 border border-emerald-500/20 rounded-[20px] p-6 text-sm text-emerald-200 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
                  {safeStringify(s.response_text ?? s.response)}
                </div>
              </div>
            </div>

            <div className="space-y-10">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-slate-400" />
                    <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">
                      Evaluation & Policy
                    </span>
                  </div>
                </div>
                {evalContextLabel && (
                  <p className="text-xs text-slate-500 italic -mt-1 mb-2">
                    {evalContextLabel}
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="col-span-2 md:col-span-3 bg-[#18191e] border border-white/5 hover:border-white/10 transition-colors p-5 rounded-[20px] flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-6 h-6 text-blue-500" />
                        <span className="text-base font-medium text-slate-200">Policy Validation</span>
                      </div>
                      <span
                        className={clsx(
                          'px-3 py-1 text-xs font-black uppercase tracking-widest rounded-xl',
                          displayPolicyStatus === 'pass'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : displayPolicyStatus === 'fail'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-slate-500/10 text-slate-400 border border-white/5'
                        )}
                      >
                        {displayPolicyStatus}
                      </span>
                    </div>
                    {useOverride && evalResultOverride?.policyStatus === 'fail' && policyState?.message && (
                      <div className="text-sm font-mono text-rose-400 mt-2 bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10">
                        {safeStringify(policyState.message)}
                      </div>
                    )}
                  </div>

                  {effectiveEvalEnabled &&
                    displayEvalRows.map((row) => {
                      const detail = getEvalDetail(s, row.id, savedEvalConfig);
                      return (
                        <div
                          key={row.id}
                          className="bg-[#18191e] border border-white/5 hover:border-white/10 transition-colors p-5 rounded-[20px] flex flex-col items-center text-center gap-3"
                        >
                          <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                            <Scale className="w-6 h-6 text-blue-400" />
                          </div>
                          <span
                            className="text-sm font-medium text-slate-200 mt-1 line-clamp-1"
                            title={EVAL_CHECK_LABELS[row.id]}
                          >
                            {EVAL_CHECK_LABELS[row.id] || row.id}
                          </span>
                          <div className="flex-1" />
                          {(detail.actualStr !== '—' || detail.configStr !== '—') && (
                            <div className="flex flex-col items-center gap-1 text-xs font-mono mb-2">
                              <span
                                className={clsx(row.status === 'fail' ? 'text-rose-400 font-bold' : 'text-slate-300')}
                              >
                                {detail.actualStr}
                              </span>
                              <span className="text-slate-500 text-[10px]">({detail.configStr})</span>
                            </div>
                          )}
                          <span
                            className={clsx(
                              'px-3 py-1 text-xs font-black uppercase tracking-widest rounded-xl w-full',
                              row.status === 'pass'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : row.status === 'fail'
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : 'bg-slate-500/10 text-slate-500'
                            )}
                          >
                            {row.status === 'na' ? 'NA' : row.status}
                          </span>
                        </div>
                      );
                    })}
                </div>
                {effectiveEvalEnabled && displayEvalRows.length === 0 && (
                  <p className="text-sm text-slate-500 italic p-4 text-center border border-dashed border-white/10 rounded-2xl">
                    No eval configured in settings.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-4 mt-10">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <Activity className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">Execution Steps</span>
                </div>
                <div className="flex flex-col gap-3">
                  {!stepLogs.length && (
                    <p className="text-sm text-slate-500 font-mono italic p-4 text-center border border-dashed border-white/10 rounded-2xl">
                      No steps recorded
                    </p>
                  )}
                  {stepLogs.map((step, idx) => (
                    <div
                      key={`${s.id}-step-${idx}`}
                      className="bg-[#18191e] border border-white/5 rounded-2xl p-4 flex flex-col gap-2 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {step.status.includes('fail') || step.status.includes('error') ? (
                            <XCircle className="w-5 h-5 text-rose-500" />
                          ) : step.status.includes('pass') || step.status.includes('success') ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-slate-500" />
                          )}
                          <span
                            className="text-sm text-slate-200 font-medium truncate max-w-[200px] md:max-w-md"
                            title={step.name}
                          >
                            {step.name}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono bg-white/5 px-2 py-1 rounded-xl">
                          {step.runtimeMs != null ? `${step.runtimeMs}ms` : '—'}
                        </span>
                      </div>
                      {step.detail && (
                        <div className="text-xs text-slate-400 mt-2 pl-8 font-mono bg-black/20 p-3 rounded-2xl border border-white/5">
                          {step.detail}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default SnapshotDetailModal;
