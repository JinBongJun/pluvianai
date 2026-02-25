'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChevronRight, Shield, Zap, Book, Layers, Search, History, Activity } from 'lucide-react';
import Link from 'next/link';

type SectionId = 'introduction' | 'quickstart' | 'key-concepts' | 'architecture' | 'logic-guard' | 'security-scans' | 'trace-history';

interface ContentItem {
    id: SectionId;
    title: string;
    icon: React.ReactNode;
    content: React.ReactNode;
}

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState<SectionId>('introduction');

    const DOCS_CONTENT: Record<SectionId, ContentItem> = {
        'introduction': {
            id: 'introduction',
            title: 'Introduction',
            icon: <Book className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-2xl text-slate-400 leading-relaxed font-semibold max-w-4xl">
                        Pluvian is a <span className="text-white">symbiotic validation layer</span> designed to &quot;cure&quot; AI agents from hallucinations, PII leaks, and logic breakdowns with clinical precision.
                    </p>
                    <div className="grid md:grid-cols-1 gap-8">
                        <div className="p-10 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-all group cursor-pointer max-w-2xl" onClick={() => setActiveSection('quickstart')}>
                            <Zap className="w-12 h-12 text-emerald-400 mb-6" />
                            <h3 className="text-2xl font-black mb-4">Quickstart Guide</h3>
                            <p className="text-lg text-slate-500 leading-relaxed mb-6">Learn how to integrate the Pluvian SDK in under 5 minutes and begin monitoring cognitive signal health with clinical precision.</p>
                            <div className="flex items-center text-sm font-black text-emerald-400 uppercase tracking-widest group-hover:gap-3 transition-all">
                                Start Integration <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        'quickstart': {
            id: 'quickstart',
            title: 'Quickstart Guide',
            icon: <Zap className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-10">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        PluvianAI &quot;Diagnostic&quot; factors for AI reliability. Get PluvianAI running in your environment in 3 simple steps.
                    </p>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 max-w-4xl">
                        <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Important</div>
                        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                            Zero-config setup captures <span className="text-white font-semibold">LLM API calls</span> automatically.
                            For universal coverage of <span className="text-white font-semibold">tool executions</span> (HTTP/DB/Slack/email/custom tools)
                            and precise workflow semantics, you may optionally add lightweight instrumentation (e.g., wrap tool execution) in your codebase.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 max-w-4xl">
                        <div className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">Agent Identity Rule</div>
                        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                            Pluvian groups traces by a stable <span className="text-white font-semibold">agent_id</span>. Priority is:
                            <span className="text-white"> explicit SDK/header agent name</span> → <span className="text-white">payload.agent_id/agent_name</span> →
                            <span className="text-white"> deterministic system prompt hash</span> fallback. For clean Live View and Policy rules, always send a stable agent name.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 max-w-5xl">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-300">Evaluation</h4>
                            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                                Atomic Signals (13 checks) score each incoming snapshot for quality, safety, and consistency trends.
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-300">Policy</h4>
                            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                                Policy rules are explicit pass/fail guardrails (forbidden tool, tool order, args schema) used for validation and CI gate decisions.
                            </p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 max-w-5xl space-y-5">
                        <h4 className="text-base font-black uppercase tracking-[0.2em] text-slate-200">Evaluation Settings (Simple Guide)</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Evaluation is your configuration area. Turn checks on/off, set thresholds, and save. Use <span className="text-white font-semibold">Clinical Log - Last N runs</span> to control how many recent runs are included when evaluation executes.
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">1) Empty / Short Answers</h5>
                                <p className="mt-2 text-xs text-slate-400">Detects very short outputs.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Minimum Characters (range 1-10,000). Start around 16-80 by use case.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">2) Latency Spikes</h5>
                                <p className="mt-2 text-xs text-slate-400">Detects slow responses.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Warn (100-120,000 ms), Critical (200-180,000 ms). Keep warn ≤ critical.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">3) HTTP Error Codes</h5>
                                <p className="mt-2 text-xs text-slate-400">Flags HTTP failures.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Warn From / Critical From (100-599). Common default: 400 / 500.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">4) Refusal / Non-Answer</h5>
                                <p className="mt-2 text-xs text-slate-400">Pattern-based refusal detection.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: ON/OFF only.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">5) JSON Validity</h5>
                                <p className="mt-2 text-xs text-slate-400">Checks output JSON format.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: if_json (recommended) or always.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">6) Output Length Drift</h5>
                                <p className="mt-2 text-xs text-slate-400">Detects unusual length changes.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Warn ratio (0-2), Critical ratio (0-3).</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">7) Token Usage Spikes</h5>
                                <p className="mt-2 text-xs text-slate-400">Controls token growth and cost risk.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Warning Threshold (100-200,000 tokens).</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">8) High Cost Alert</h5>
                                <p className="mt-2 text-xs text-slate-400">Flags expensive responses.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Warning Cost (0-100 USD).</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">9) Repetition / Loops</h5>
                                <p className="mt-2 text-xs text-slate-400">Detects repeated-line loops.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Warn Repeats (1-100), Critical Repeats (1-150).</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">10) Required Keywords / Fields</h5>
                                <p className="mt-2 text-xs text-slate-400">Enforces required response content.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: keywords CSV and JSON fields CSV.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">11) Format Contract</h5>
                                <p className="mt-2 text-xs text-slate-400">Enforces sections/phrases in output format.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: required sections CSV.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">12) PII Leakage Shield</h5>
                                <p className="mt-2 text-xs text-slate-400">Detects potential PII and secret patterns.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: ON/OFF only.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-2">
                                <h5 className="text-sm font-black text-white">13) Reasoning Coherence</h5>
                                <p className="mt-2 text-xs text-slate-400">Checks logical consistency score.</p>
                                <p className="mt-1 text-xs text-slate-500">Set: Minimum Score (0-100). Start around 70-85.</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 max-w-5xl space-y-5">
                        <h4 className="text-base font-black uppercase tracking-[0.2em] text-slate-200">Policy (Guardrails) — Scopes & Tool Definition</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Policy is for <span className="text-white font-semibold">deterministic, enforceable constraints</span>. Unlike Evaluation (soft checks),
                            Policy answers: “Did this run violate a hard rule?”.
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">1) Project Default Rules</h5>
                                <p className="mt-2 text-xs text-slate-400">Apply to every agent in the project (baseline guardrails).</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Use for org-wide safety: block dangerous tools, enforce “search before answer”, set required schema for critical actions.
                                </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <h5 className="text-sm font-black text-white">2) Agent Overrides</h5>
                                <p className="mt-2 text-xs text-slate-400">Only apply when validating traces that include a specific agent id.</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Use when one agent has special permissions (e.g., “payments_agent” can call billing tools; others cannot).
                                </p>
                                <p className="mt-2 text-xs text-slate-500">
                                    Override strategy options: <span className="text-slate-300">replace_same_name</span>,
                                    <span className="text-slate-300"> replace_same_type</span>, or
                                    <span className="text-slate-300"> additive</span>.
                                </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-2">
                                <h5 className="text-sm font-black text-white">3) What is a “Tool”?</h5>
                                <p className="mt-2 text-xs text-slate-400">
                                    In PluvianAI, a tool is a <span className="text-white font-semibold">named action</span> the agent requests or executes.
                                </p>
                                <ul className="mt-2 text-xs text-slate-500 space-y-1 list-disc list-inside">
                                    <li>
                                        <span className="text-slate-300 font-semibold">Standard (no extra code)</span>: LLM function/tool calls embedded in model payload
                                        (e.g., OpenAI-style <span className="font-mono">tool_calls[].function.name</span> + <span className="font-mono">arguments</span>).
                                    </li>
                                    <li>
                                        <span className="text-slate-300 font-semibold">Optional (more power)</span>: instrument real tool execution as named events (HTTP, DB, Slack, email, filesystem),
                                        so policies can validate what actually happened, not only what the model asked for.
                                    </li>
                                </ul>
                                <p className="mt-3 text-xs text-slate-500">
                                    Recommendation: start with LLM tool calls. Add lightweight instrumentation only for “must be correct” tools (payments, secrets, outbound side-effects).
                                </p>
                            </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <h5 className="text-sm font-black text-white">Supported Policy Rule Types (MVP)</h5>
                            <ul className="mt-2 text-xs text-slate-500 space-y-1 list-disc list-inside">
                                <li><span className="text-slate-300 font-semibold">tool_forbidden</span>: fail if any forbidden tool name is called.</li>
                                <li><span className="text-slate-300 font-semibold">tool_allowlist</span>: fail if any tool is called outside the allowlist.</li>
                                <li><span className="text-slate-300 font-semibold">tool_order</span>: enforce “A must happen before B”.</li>
                                <li><span className="text-slate-300 font-semibold">tool_args_schema</span>: validate tool arguments against JSON Schema.</li>
                            </ul>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                            <h5 className="text-sm font-black text-white">Example Rule JSON</h5>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Create these from <span className="text-slate-300 font-semibold">Live View → agent → Policy tab</span> or via API. Agent overrides are additive on top of project defaults.
                            </p>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Project Default · Forbidden</div>
                                    <pre className="text-[10px] font-mono leading-relaxed text-emerald-300 whitespace-pre-wrap">
{`{
  "name": "Block shell execution",
  "scope_type": "project",
  "severity_default": "critical",
  "enabled": true,
  "rule_json": {
    "type": "tool_forbidden",
    "severity": "critical",
    "spec": { "tools": ["shell.exec", "os.system"] }
  }
}`}
                                    </pre>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Agent Override · Allowlist</div>
                                    <pre className="text-[10px] font-mono leading-relaxed text-emerald-300 whitespace-pre-wrap">
{`{
  "name": "payments_agent allowed tools",
  "scope_type": "agent",
  "scope_ref": "payments_agent",
  "severity_default": "high",
  "enabled": true,
  "rule_json": {
    "type": "tool_allowlist",
    "severity": "high",
    "spec": { "tools": ["search", "billing.charge", "billing.refund"] }
  }
}`}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-12">
                        <section className="space-y-4">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black text-sm">1</span>
                                Install SDK
                            </h3>
                            <pre className="p-6 rounded-xl bg-black border border-white/10 overflow-x-auto">
                                <code className="text-emerald-400 font-mono text-lg">npm install @pluvian/sdk</code>
                            </pre>
                        </section>
                        <section className="space-y-4">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black text-sm">2</span>
                                Initialize Guard
                            </h3>
                            <pre className="p-10 rounded-2xl bg-[#0a0a0c] border border-white/10 overflow-x-auto shadow-2xl">
                                <code className="text-emerald-400 font-mono text-lg leading-relaxed">
                                    {`import { Pluvian } from '@pluvian/sdk';

const pluvian = new Pluvian({
    apiKey: process.env.PLUVIAN_API_KEY
});`}
                                </code>
                            </pre>
                        </section>
                    </div>
                </div>
            )
        },
        'key-concepts': {
            id: 'key-concepts',
            title: 'Key Concepts',
            icon: <Activity className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-10">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Deep dive into the cognitive signals and validation mechanisms that power PluvianAI.
                    </p>
                    <div className="grid grid-cols-1 gap-6">
                        <div className="p-8 rounded-xl bg-white/5 border border-white/10">
                            <h4 className="text-xl font-bold mb-3 text-white">Symbiotic Guard</h4>
                            <p className="text-slate-400">Unlike passive monitors, Pluvian lives within your agent&apos;s execution loop. It intercepts outputs, validates them against &quot;Pathogens&quot; (hallucinations, leaks), and applies a &quot;Cure&quot; before the user ever sees the error.</p>
                        </div>
                        <div className="p-8 rounded-xl bg-white/5 border border-white/10">
                            <h4 className="text-xl font-bold mb-3 text-white">Atomic Signals</h4>
                            <p className="text-slate-400">We decompose AI risk into 13 discrete signals (e.g., Semantic Integrity, Logic Gaps). Each signal represents a measurable aspect of agent stability.</p>
                        </div>
                        <div className="p-8 rounded-xl bg-white/5 border border-white/10">
                            <h4 className="text-xl font-bold mb-3 text-white">Evaluation vs Policy</h4>
                            <p className="text-slate-400">Evaluation measures what happened on each trace; Policy enforces what must or must not happen. Use Evaluation for monitoring and regression trends, and Policy for release gates and deterministic validation.</p>
                        </div>
                        <div className="p-8 rounded-xl bg-white/5 border border-white/10">
                            <h4 className="text-xl font-bold mb-3 text-white">Agent Grouping Contract</h4>
                            <p className="text-slate-400">Agent-level dashboards and rule scopes rely on stable identity. Recommended contract: always set a durable agent name in SDK chain context or proxy header. Hash fallback exists for safety, not as primary identity.</p>
                        </div>
                    </div>
                </div>
            )
        },
        'architecture': {
            id: 'architecture',
            title: 'Architecture',
            icon: <Layers className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        PluvianAI &quot;Shield&quot; prevents unauthorized model access. Pluvian sits between your LLM Orchestrator (LangChain, AutoGPT, etc.) and your API Interface.
                    </p>
                    <div className="p-16 rounded-2xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-xs font-bold">LLM MODEL</div>
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                            <div className="p-4 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-xs font-bold text-emerald-400 animate-pulse">PLUVIAN GUARD</div>
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-xs font-bold">END USER</div>
                        </div>
                        <span className="text-slate-600 font-bold uppercase tracking-[0.2em] text-[10px] mt-4">Transparent Validation Proxy</span>
                    </div>
                </div>
            )
        },
        'logic-guard': {
            id: 'logic-guard',
            title: 'Logic Guard',
            icon: <Shield className="w-12 h-12 text-cyan-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Prevent hallucinations by enforcing deterministic rules on non-deterministic models. Logic Guard ensures your agent doesn&apos;t &quot;invent&quot; facts or skip critical workflow steps.
                    </p>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 max-w-4xl">
                        <h4 className="text-base font-black uppercase tracking-[0.2em] text-slate-300">Current Rule Types</h4>
                        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                            Start with practical policy checks: <span className="text-white">tool_forbidden</span>, <span className="text-white">tool_allowlist</span>, <span className="text-white">tool_order</span>, and <span className="text-white">tool_args_schema</span>.
                            These rules evaluate trajectory/tool usage data and are designed for Policy reports and CI gates.
                        </p>
                    </div>
                </div>
            )
        },
        'security-scans': {
            id: 'security-scans',
            title: 'Security Scans',
            icon: <Search className="w-12 h-12 text-orange-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Real-time PII scrubbing, secret detection, and prompt-injection prevention. Protect your sensitive data and model integrity without slowing down execution.
                    </p>
                </div>
            )
        },
        'trace-history': {
            id: 'trace-history',
            title: 'Trace History',
            icon: <History className="w-12 h-12 text-slate-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Every validation, correction, and signal metric is stored in your private trace history. Replay historic runs to optimize your &quot;Immune System&quot; rules.
                    </p>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 max-w-4xl">
                        <h4 className="text-base font-black uppercase tracking-[0.2em] text-slate-300">Execution Model</h4>
                        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                            Atomic Signal evaluation is automatic on snapshot ingestion. Policy validation is run on demand (e.g., Run Policy Check, Compare, CI Gate) so teams can control cost, noise, and release timing.
                        </p>
                    </div>
                </div>
            )
        }
    };

    const sidebarItems = [
        {
            category: 'Getting Started',
            links: [
                { id: 'introduction', label: 'Introduction' },
                { id: 'quickstart', label: 'Quickstart' },
                { id: 'key-concepts', label: 'Key Concepts' },
                { id: 'architecture', label: 'Architecture' }
            ]
        },
        {
            category: 'Core Lab',
            links: [
                { id: 'logic-guard', label: 'Logic Guard' },
                { id: 'security-scans', label: 'Security Scans' },
                { id: 'trace-history', label: 'Trace History' }
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white selection:bg-emerald-500/30 font-sans">
            {/* 1. Navbar */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl">
                <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 h-[100px] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="flex items-center gap-4 group">
                            <div className="relative w-16 h-16 pointer-events-none select-none group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                                    <path
                                        d="M20 50 C 20 20, 80 20, 80 50 L 80 80 L 20 80 Z"
                                        fill="none"
                                        stroke="#06b6d4"
                                        strokeWidth="4"
                                        className="animate-pulse"
                                    />
                                    <circle cx="40" cy="45" r="5" fill="#10b981" />
                                    <path d="M60 60 L 90 40" stroke="#10b981" strokeWidth="2" />
                                </svg>
                            </div>
                            <span className="text-3xl font-bold tracking-tight text-white group-hover:text-emerald-400 transition-colors">PluvianAI</span>
                        </Link>
                    </div>

                    <div className="flex items-center gap-8 lg:gap-10">
                        <div className="hidden md:flex items-center gap-6 text-lg font-bold">
                            <Link href="/login" className="text-slate-400 hover:text-white transition-colors">Log In</Link>
                        </div>
                        <Link href="/organizations">
                            <Button className="bg-emerald-500 text-black font-black px-8 h-12 text-lg rounded-md shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-105 whitespace-nowrap">
                                Start Validation
                            </Button>
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 py-[160px] flex gap-16">
                {/* Sidebar Navigation */}
                <aside className="w-72 hidden lg:block shrink-0">
                    <div className="sticky top-[160px] space-y-10">
                        {sidebarItems.map(group => (
                            <div key={group.category}>
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-6">{group.category}</h3>
                                <div className="space-y-2">
                                    {group.links.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveSection(item.id as SectionId)}
                                            className={`flex w-full items-center justify-between p-3 rounded-md transition-all text-left text-base font-bold
                                                ${activeSection === item.id
                                                    ? 'bg-emerald-500/10 text-emerald-400 shadow-[inset_4px_0_0_0_#10b981]'
                                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-grow max-w-5xl overflow-hidden">
                    <div key={activeSection} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="space-y-16">
                            <div className="space-y-6">
                                {DOCS_CONTENT[activeSection].icon}
                                <h1 className="text-6xl md:text-7xl font-black tracking-tight mb-8">
                                    {DOCS_CONTENT[activeSection].title}
                                </h1>
                                {DOCS_CONTENT[activeSection].content}
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Simple Footer */}
            <footer className="py-32 border-t border-white/5 text-center bg-[#08080a]">
                <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-600">
                    The &quot;PluvianAI&quot; Protocol: Secure, Technical, Clinical.
                    © 2026 PluvianAI Inc. Clinical Docs v1.0
                </p>
            </footer>
        </div>
    );
}
