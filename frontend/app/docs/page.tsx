"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChevronRight, Shield, Zap, Book, Layers, Search, History, Activity, Terminal } from "lucide-react";
import Link from "next/link";
import { RobotBirdIcon } from "@/components/shared/RobotBirdIcon";

type SectionId =
  | "introduction"
  | "quickstart"
  | "key-concepts"
  | "architecture"
  | "logic-guard"
  | "security-scans"
  | "trace-history";

interface ContentItem {
  id: SectionId;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("introduction");

  const DOCS_CONTENT: Record<SectionId, ContentItem> = {
    introduction: {
      id: "introduction",
      title: "Introduction",
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.15)] mb-8">
          <Book className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-12">
          <p className="text-2xl text-slate-400 leading-relaxed font-medium max-w-4xl tracking-tight">
            PluvianAI is a{" "}
            <span className="text-white font-black underline decoration-emerald-500/30 underline-offset-4">
              node-level regression guard
            </span>{" "}
            for AI agents. It replays real traces under your new model or prompt configuration, compares
            behavior against a baseline, and gives you a clear pass/fail gate before you deploy.
          </p>
          <div className="grid md:grid-cols-1 gap-8">
            <div
              className="p-10 rounded-[32px] bg-white/[0.02] border border-white/10 hover:border-emerald-500/30 hover:bg-white/[0.04] transition-all duration-500 group cursor-pointer max-w-2xl relative overflow-hidden"
              onClick={() => setActiveSection("quickstart")}
            >
              <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />
              <div className="relative z-10 text-emerald-400 mb-8 opacity-80 group-hover:opacity-100 transition-opacity">
                <Zap className="w-10 h-10 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
              </div>
              <h3 className="text-3xl font-black mb-4 text-white uppercase tracking-tighter">
                Live View &amp; Release Gate
              </h3>
              <p className="text-lg text-slate-500 leading-relaxed mb-8">
                Learn how to send production traces to PluvianAI and use Live View and Release Gate to validate
                behavior changes before rollout.
              </p>
              <div className="flex items-center text-xs font-black text-emerald-400 uppercase tracking-widest gap-2 group-hover:gap-4 transition-all">
                Initiate Protocol <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    quickstart: {
      id: "quickstart",
      title: "Quickstart Guide",
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.15)] mb-8">
          <Zap className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-12">
          <p className="text-2xl text-slate-400 leading-relaxed font-medium max-w-4xl tracking-tight">
            PluvianAI runs on real traces from your agents. This quickstart shows how to send snapshots into Live
            View and run Release Gate to compare baseline versus candidate behavior.
          </p>

          <div className="rounded-[24px] border border-amber-500/30 bg-amber-500/5 p-8 max-w-4xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-400 mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Critical Initialization
            </div>
            <p className="text-base text-amber-500/80 leading-relaxed font-medium">
              Start by mirroring your agent&apos;s requests and responses to PluvianAI as snapshots. Most teams add a
              small helper in their orchestrator or gateway that forwards trace data over HTTP, so Live View can
              observe behavior without changing how traffic reaches your users.
            </p>
          </div>

          <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/5 p-8 max-w-4xl relative">
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-400 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Agent Identity Protocol
            </div>
            <p className="text-base text-slate-400 leading-relaxed">
              Pluvian groups traces by a stable <span className="text-white font-bold bg-white/10 px-2 py-0.5 rounded">agent_id</span>. Priority hierarchy:
              <br /><br />
              <span className="flex items-center gap-3">
                <span className="px-3 py-1 rounded bg-emerald-500/10 text-emerald-400 font-bold text-sm">1. Explicit Name</span> <ChevronRight className="w-4 h-4 text-slate-600" />
                <span className="px-3 py-1 rounded bg-white/5 text-slate-300 font-bold text-sm">2. Payload ID</span> <ChevronRight className="w-4 h-4 text-slate-600" />
                <span className="px-3 py-1 rounded bg-white/5 text-slate-500 font-bold text-sm">3. Prompt Hash Fallback</span>
              </span>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-colors">
              <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-3 mb-4">
                <Activity className="w-5 h-5 text-indigo-400" /> Evaluation
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                Atomic Signals run deterministic checks on each snapshot – for example latency, JSON validity, length,
                refusal, PII, and basic tool policy signals.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-colors">
              <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-rose-400" /> Policy
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                Explicit pass/fail guardrails (forbidden tool, tool order, args schema) used for validation and CI gate decisions.
              </p>
            </div>
          </div>
          <div className="rounded-[32px] border border-white/10 bg-white/[0.02] p-8 max-w-5xl space-y-8 relative overflow-hidden backdrop-blur-md">
            <div className="absolute inset-0 bg-flowing-lines opacity-[0.02] pointer-events-none" />
            <div className="relative z-10">
              <h4 className="text-lg font-black uppercase tracking-[0.2em] text-white flex items-center gap-3 mb-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                Evaluation Matrix
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed mb-8 max-w-3xl">
                Evaluation represents your soft-validation configuration. Activate checks, define thresholds, and secure stability. Use <span className="text-white font-bold bg-white/10 px-2 py-0.5 rounded">Clinical Log</span> to dictate sample sizes.
              </p>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[
                  { title: "Empty / Short Answers", desc: "Detects overly short or empty outputs.", value: "Min chars or tokens" },
                  { title: "JSON Validity", desc: "Ensures responses are valid JSON when required.", value: "Strict / lenient modes" },
                  { title: "Refusal Detection", desc: "Flags pattern-based refusals instead of helpful answers.", value: "Boolean check" },
                  { title: "Output Length Guard", desc: "Detects unusual length drift between runs.", value: "Length / token ratios" },
                  { title: "Latency Guard", desc: "Tracks response latency for each snapshot.", value: "Warning thresholds" },
                  { title: "PII & Secret Guard", desc: "Helps catch obvious PII or secret-like strings.", value: "Rule-based filters", span: true }
                ].map((item, i) => (
                  <div key={i} className={`rounded-2xl border border-white/5 bg-black/40 p-5 hover:border-emerald-500/30 transition-colors group ${item.span ? 'md:col-span-2 xl:col-span-3 bg-emerald-500/5' : ''}`}>
                    <h5 className="text-[11px] font-black tracking-widest uppercase text-white mb-2 flex items-center gap-2">
                      <span className="text-emerald-500/50">{String(i + 1).padStart(2, '0')}</span> {item.title}
                    </h5>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">{item.desc}</p>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-black/40 px-3 py-1.5 rounded inline-block border border-white/5">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 max-w-5xl space-y-5">
            <h4 className="text-base font-black uppercase tracking-[0.2em] text-slate-200">
              Policy (Guardrails) — Scopes & Tool Definition
            </h4>
            <p className="text-sm text-slate-400 leading-relaxed">
              Policy is for{" "}
              <span className="text-white font-semibold">
                deterministic, enforceable constraints
              </span>
              . Unlike Evaluation (soft checks), Policy answers: “Did this run violate a hard
              rule?”.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <h5 className="text-sm font-black text-white">1) Project Default Rules</h5>
                <p className="mt-2 text-xs text-slate-400">
                  Apply to every agent in the project (baseline guardrails).
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Use for org-wide safety: block dangerous tools, enforce “search before answer”,
                  set required schema for critical actions.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <h5 className="text-sm font-black text-white">2) Agent Overrides</h5>
                <p className="mt-2 text-xs text-slate-400">
                  Only apply when validating traces that include a specific agent id.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Use when one agent has special permissions (e.g., “payments_agent” can call
                  billing tools; others cannot).
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Override strategy options:{" "}
                  <span className="text-slate-300">replace_same_name</span>,
                  <span className="text-slate-300"> replace_same_type</span>, or
                  <span className="text-slate-300"> additive</span>.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-2">
                <h5 className="text-sm font-black text-white">3) What is a “Tool”?</h5>
                <p className="mt-2 text-xs text-slate-400">
                  In PluvianAI, a tool is a{" "}
                  <span className="text-white font-semibold">named action</span> the agent requests
                  or executes.
                </p>
                <ul className="mt-2 text-xs text-slate-500 space-y-1 list-disc list-inside">
                  <li>
                    <span className="text-slate-300 font-semibold">Standard (no extra code)</span>:
                    LLM function/tool calls embedded in model payload (e.g., OpenAI-style{" "}
                    <span className="font-mono">tool_calls[].function.name</span> +{" "}
                    <span className="font-mono">arguments</span>).
                  </li>
                  <li>
                    <span className="text-slate-300 font-semibold">Optional (more power)</span>:
                    instrument real tool execution as named events (HTTP, DB, Slack, email,
                    filesystem), so policies can validate what actually happened, not only what the
                    model asked for.
                  </li>
                </ul>
                <p className="mt-3 text-xs text-slate-500">
                  Recommendation: start with LLM tool calls. Add lightweight instrumentation only
                  for “must be correct” tools (payments, secrets, outbound side-effects).
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h5 className="text-sm font-black text-white">Supported Policy Rule Types (MVP)</h5>
              <ul className="mt-2 text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>
                  <span className="text-slate-300 font-semibold">tool_forbidden</span>: fail if any
                  forbidden tool name is called.
                </li>
                <li>
                  <span className="text-slate-300 font-semibold">tool_allowlist</span>: fail if any
                  tool is called outside the allowlist.
                </li>
                <li>
                  <span className="text-slate-300 font-semibold">tool_order</span>: enforce “A must
                  happen before B”.
                </li>
                <li>
                  <span className="text-slate-300 font-semibold">tool_args_schema</span>: validate
                  tool arguments against JSON Schema.
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
              <h5 className="text-sm font-black text-white">Example Rule JSON</h5>
              <p className="text-xs text-slate-500 leading-relaxed">
                Create these from{" "}
                <span className="text-slate-300 font-semibold">Live View → agent → Policy tab</span>{" "}
                or via API. Agent overrides are additive on top of project defaults.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    Project Default · Forbidden
                  </div>
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
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    Agent Override · Allowlist
                  </div>
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
            <section className="space-y-6">
              <h3 className="text-xl font-black uppercase tracking-widest text-white flex items-center gap-4">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                  01
                </span>
                Send a snapshot
              </h3>
              <pre className="p-6 rounded-2xl bg-black/50 border border-white/5 overflow-x-auto relative">
                <div className="absolute top-0 right-0 p-4 text-[10px] font-black uppercase tracking-widest text-slate-600">
                  HTTP
                </div>
                <code className="text-emerald-300 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {`POST https://api.pluvian.ai/api/v1/projects/{project_id}/snapshots
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "trace_id": "trace-123",
  "provider": "openai",
  "model": "gpt-4o",
  "payload": {
    "request": { ... },
    "response": { ... }
  }
}`}
                </code>
              </pre>
            </section>

            <section className="space-y-6">
              <h3 className="text-xl font-black uppercase tracking-widest text-white flex items-center gap-4">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                  02
                </span>
                Inspect in Live View
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
                Once snapshots arrive, open Live View to see traces grouped by node. Each snapshot is scored by Atomic
                Signals, and you can drill into payloads, evaluations, and policy violations before setting up Release
                Gate.
              </p>
            </section>

            <section className="space-y-6">
              <h3 className="text-xl font-black uppercase tracking-widest text-white flex items-center gap-4">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                  03
                </span>
                Run Release Gate
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
                Pick baseline snapshots for a node, choose a new model or prompt configuration, and run Release Gate.
                PluvianAI replays each trace, computes a behavior diff between baseline and candidate, applies your
                Atomic Signals and Policy rules, and returns a pass/fail verdict plus Stable / Minor / Major change
                labels for each attempt.
              </p>
            </section>
          </div>
        </div>
      ),
    },
    "key-concepts": {
      id: "key-concepts",
      title: "Key Concepts",
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.15)] mb-8">
          <Activity className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-12">
          <p className="text-2xl text-slate-400 leading-relaxed font-medium max-w-4xl tracking-tight">
            Deep dive into the key concepts that power PluvianAI&apos;s node-level regression guard: Live View, behavior
            diff, Atomic Signals, and Policy versus Evaluation.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-10 rounded-[32px] bg-white/[0.02] border border-white/10 hover:border-indigo-500/30 transition-colors relative overflow-hidden group">
              <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 relative z-10">
                <Shield className="w-5 h-5 text-indigo-400" />
              </div>
              <h4 className="text-lg font-black uppercase tracking-widest mb-4 text-white relative z-10">
                Behavior Diff
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed relative z-10">
                PluvianAI compares how a node behaves before and after a change. It derives canonical steps from each
                response, computes sequence and tool-usage distance between baseline and candidate traces, and labels
                changes as Stable, Minor, or Major to guide deployment decisions.
              </p>
            </div>

            <div className="p-10 rounded-[32px] bg-white/[0.02] border border-white/10 hover:border-emerald-500/30 transition-colors relative overflow-hidden group">
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 relative z-10">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <h4 className="text-lg font-black uppercase tracking-widest mb-4 text-white relative z-10">Atomic Signals</h4>
              <p className="text-sm text-slate-400 leading-relaxed relative z-10">
                Atomic Signals are rule-based checks on each snapshot – for example JSON validity, length, latency,
                refusal, PII, and tool policy. They provide simple, deterministic signals that can be combined into
                dashboards and gates.
              </p>
            </div>

            <div className="p-10 rounded-[32px] bg-white/[0.02] border border-white/10 hover:border-rose-500/30 transition-colors md:col-span-2 relative overflow-hidden group">
              <div className="absolute inset-0 bg-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center mb-6 border border-rose-500/20 relative z-10">
                <Terminal className="w-5 h-5 text-rose-400" />
              </div>
              <h4 className="text-lg font-black uppercase tracking-widest mb-4 text-white relative z-10">Evaluation vs Policy Protocol</h4>
              <p className="text-sm text-slate-400 leading-relaxed max-w-3xl relative z-10">
                Evaluation measures what happened on each trace; Policy enforces what must or must not happen. Use Evaluation for holistic monitoring and regression trends, and rely on Policy for strict release gates and deterministic validation constraints.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    architecture: {
      id: "architecture",
      title: "Architecture",
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.15)] mb-8">
          <Layers className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-12">
          <p className="text-2xl text-slate-400 leading-relaxed font-medium max-w-4xl tracking-tight">
            The PluvianAI guard layer sits between your orchestrator and LLM providers, or receives mirrored traces via
            HTTP. It evaluates behavior before and after changes so you can ship new configs with confidence.
          </p>
          <div className="p-20 rounded-[40px] bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-6 relative overflow-hidden backdrop-blur-xl">
            <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent pointer-events-none" />

            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 relative z-10 w-full max-w-3xl justify-center">
              <div className="p-6 w-full md:w-48 text-center rounded-2xl bg-black/40 border border-white/10 shadow-lg">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Source</span>
                <span className="text-sm font-bold text-white">LLM MODEL</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <ChevronRight className="w-6 h-6 text-slate-600 rotate-90 md:rotate-0" />
              </div>

              <div className="p-8 w-full md:w-56 text-center rounded-3xl bg-cyan-500/10 border border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.2)] relative">
                <div className="absolute inset-0 rounded-3xl border border-cyan-400/50 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-500 block mb-2">Gateway</span>
                <span className="text-base font-black text-white">PLUVIAN GUARD</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <ChevronRight className="w-6 h-6 text-slate-600 rotate-90 md:rotate-0" />
              </div>

              <div className="p-6 w-full md:w-48 text-center rounded-2xl bg-black/40 border border-white/10 shadow-lg">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Destination</span>
                <span className="text-sm font-bold text-white">END USER</span>
              </div>
            </div>

            <span className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px] mt-8 relative z-10">
              {`/// Transparent Validation Proxy Protocol Active ///`}
            </span>
          </div>
        </div>
      ),
    },
    "logic-guard": {
      id: "logic-guard",
      title: "Logic Guard",
      icon: <Shield className="w-12 h-12 text-cyan-400 mb-6" />,
      content: (
        <div className="space-y-8">
          <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
            Define rule-based policies on tool usage and trace structure. Logic Guard evaluates forbidden tools,
            allowlists, ordering, and argument schemas so you can enforce strict rules in Release Gate and CI.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 max-w-4xl">
            <h4 className="text-base font-black uppercase tracking-[0.2em] text-slate-300">
              Current Rule Types
            </h4>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Start with practical policy checks: <span className="text-white">tool_forbidden</span>
              , <span className="text-white">tool_allowlist</span>,{" "}
              <span className="text-white">tool_order</span>, and{" "}
              <span className="text-white">tool_args_schema</span>. These rules evaluate
              trajectory/tool usage data and are designed for Policy reports and CI gates.
            </p>
          </div>
        </div>
      ),
    },
    "security-scans": {
      id: "security-scans",
      title: "Security Scans",
      icon: <Search className="w-12 h-12 text-orange-400 mb-6" />,
      content: (
        <div className="space-y-8">
          <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
            Apply basic security checks such as PII masking and prompt firewall rules to traffic routed through the
            PluvianAI proxy. These controls help reduce accidental leakage of sensitive data and system prompts.
          </p>
        </div>
      ),
    },
    "trace-history": {
      id: "trace-history",
      title: "Trace History",
      icon: <History className="w-12 h-12 text-slate-400 mb-6" />,
      content: (
        <div className="space-y-8">
          <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
            Snapshots and evaluation results are stored for your data retention window (for example, 7 days on the free
            plan). Replay past traces in Release Gate to compare behavior under new models and prompts.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 max-w-4xl">
            <h4 className="text-base font-black uppercase tracking-[0.2em] text-slate-300">
              Execution Model
            </h4>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Atomic Signal evaluation is automatic on snapshot ingestion. Policy validation is run
              on demand (e.g., Run Policy Check, Compare, CI Gate) so teams can control cost, noise,
              and release timing.
            </p>
          </div>
        </div>
      ),
    },
  };

  const sidebarItems = [
    {
      category: "Getting Started",
      links: [
        { id: "introduction", label: "Introduction" },
        { id: "quickstart", label: "Quickstart" },
        { id: "key-concepts", label: "Key Concepts" },
        { id: "architecture", label: "Architecture" },
      ],
    },
    {
      category: "Core Lab",
      links: [
        { id: "logic-guard", label: "Logic Guard" },
        { id: "security-scans", label: "Security Scans" },
        { id: "trace-history", label: "Trace History" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-emerald-500/30 font-sans">
      {/* 1. Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#030303]/80 backdrop-blur-xl">
        <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="text-emerald-500 transform group-hover:scale-110 transition-transform duration-300">
                <RobotBirdIcon size={32} />
              </div>
              <span className="text-xl font-bold tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                PluvianAI
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-8 lg:gap-10">
            <div className="hidden md:flex items-center gap-6 text-xs font-black uppercase tracking-widest">
              <Link href="/login" className="text-slate-400 hover:text-white transition-colors">
                Sign In
              </Link>
            </div>
            <Link href="/organizations">
              <Button className="bg-emerald-500 text-black font-black px-6 h-10 text-xs uppercase tracking-widest rounded-lg shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-105 hover:bg-emerald-400 whitespace-nowrap">
                Open Console
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 py-[160px] flex gap-16 relative">
        {/* Ambient Overlays */}
        <div className="fixed inset-0 bg-flowing-lines opacity-[0.02] pointer-events-none z-0" />
        <div className="fixed top-0 left-0 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none -z-10" />

        {/* Sidebar Navigation */}
        <aside className="w-72 hidden lg:block shrink-0 relative z-10">
          <div className="sticky top-[140px] space-y-12">
            {sidebarItems.map(group => (
              <div key={group.category}>
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-slate-700" />
                  {group.category}
                </h3>
                <div className="space-y-1">
                  {group.links.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id as SectionId)}
                      className={`flex w-full items-center justify-between px-4 py-3.5 rounded-xl transition-all text-left text-sm font-bold
                          ${activeSection === item.id
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                          : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200 border border-transparent"
                        }`}
                    >
                      {item.label}
                      {activeSection === item.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-grow max-w-5xl overflow-hidden relative z-10">
          <div
            key={activeSection}
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="space-y-8">
              {DOCS_CONTENT[activeSection].icon}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Documentation Section</p>
                </div>
                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-8 text-white">
                  {DOCS_CONTENT[activeSection].title}
                </h1>
              </div>
              {DOCS_CONTENT[activeSection].content}
            </div>
          </div>
        </main>
      </div>

      {/* Simple Footer */}
      <footer className="py-24 border-t border-white/5 text-center bg-black/50 backdrop-blur-xl relative z-20">
        <div className="flex items-center justify-center gap-3 mb-6">
          <RobotBirdIcon size={24} className="opacity-50" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">
          PluvianAI — Node-Level Regression Guard. © 2026 PluvianAI Inc. <br />
          Documentation v1.0
        </p>
      </footer>
    </div>
  );
}
