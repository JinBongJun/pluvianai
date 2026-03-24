"use client";

import React from "react";
import useSWR, { useSWRConfig } from "swr";
import { ShieldCheck, Plus } from "lucide-react";
import { behaviorAPI, type BehaviorRule } from "@/lib/api";
import { PolicyRuleModal } from "@/components/live-view/PolicyRuleModal";

type RuleScope = "project" | "agent";

function formatTraceTime(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US");
}

function RuleList({ rules, emptyMessage }: { rules: BehaviorRule[]; emptyMessage: string }) {
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

export function AgentPolicyPanel({ projectId, agentId }: { projectId: number; agentId: string }) {
  const { mutate: globalMutate } = useSWRConfig();

  const {
    data: projectRulesData,
    mutate: mutateProjectRules,
    isLoading: projectRulesLoading,
  } = useSWR(projectId ? ["policy-rules-project", projectId] : null, () =>
    behaviorAPI.listRules(projectId, { enabled: true, scope_type: "project" })
  );
  const {
    data: agentRulesData,
    mutate: mutateAgentRules,
    isLoading: agentRulesLoading,
  } = useSWR(projectId && agentId ? ["policy-rules-agent", projectId, agentId] : null, () =>
    behaviorAPI.listRules(projectId, { enabled: true, scope_type: "agent", scope_ref: agentId })
  );
  const { data: reportsData } = useSWR(
    projectId && agentId ? ["behavior-reports-agent", projectId, agentId] : null,
    () => behaviorAPI.listReports(projectId, { agent_id: agentId, limit: 20, offset: 0 })
  );

  const projectRules = React.useMemo(
    () => (Array.isArray(projectRulesData) ? projectRulesData : []),
    [projectRulesData]
  );
  const agentRules = React.useMemo(
    () => (Array.isArray(agentRulesData) ? agentRulesData : []),
    [agentRulesData]
  );
  const reports = React.useMemo(
    () => (Array.isArray(reportsData?.items) ? reportsData.items : []),
    [reportsData]
  );

  const [modalScope, setModalScope] = React.useState<RuleScope | null>(null);
  const [actionStatus, setActionStatus] = React.useState("");

  const latestReport = reports[0] || null;
  const isAnyRulesLoading = projectRulesLoading || agentRulesLoading;

  const handleCreateRule = async (
    payload: Omit<BehaviorRule, "id" | "created_at" | "updated_at" | "project_id">
  ) => {
    await behaviorAPI.createRule(projectId, payload);
    await Promise.all([mutateProjectRules(), mutateAgentRules()]);
    await globalMutate(
      key => Array.isArray(key) && key[0] === "behavior-rules" && key[1] === projectId
    );
    await globalMutate(
      key => Array.isArray(key) && key[0] === "policy-rules-project" && key[1] === projectId
    );
    await globalMutate(
      key =>
        Array.isArray(key) &&
        key[0] === "policy-rules-agent" &&
        key[1] === projectId &&
        key[2] === agentId
    );
    setActionStatus(
      payload.scope_type === "project"
        ? "Project default rule created."
        : "Agent override rule created."
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0f1e]/20 text-slate-200">
      <PolicyRuleModal
        isOpen={modalScope !== null}
        initialScopeType={modalScope || "project"}
        agentId={agentId}
        onClose={() => setModalScope(null)}
        onSave={handleCreateRule}
      />

      <div className="p-6 border-b border-white/5 bg-black/20">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                Policy
              </div>
              <h3 className="text-3xl font-black text-white mt-1">Rules & Checks</h3>
              <p className="text-sm text-slate-400 mt-1">
                Enabled project defaults: {projectRules.length} · enabled agent overrides:{" "}
                {agentRules.length}
              </p>
              {latestReport && (
                <p className="text-[13px] text-slate-400 mt-1">
                  Latest report:{" "}
                  <span className="text-slate-300 font-semibold uppercase">
                    {String(latestReport.status)}
                  </span>
                  {latestReport.created_at
                    ? ` · ${formatTraceTime(String(latestReport.created_at))}`
                    : ""}
                </p>
              )}
            </div>
          </div>
          <div className="w-full text-right">
            <p className="text-[11px] text-slate-400">
              Policy evaluation and dataset save actions are handled in Live Logs.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-2">
            Status
          </div>
          <div className="text-sm text-slate-300">
            Configure policy rules here. Run validation from Live Logs per log.
          </div>
          {latestReport && (
            <div className="mt-3 text-sm text-slate-400">
              Latest report:{" "}
              <span className="text-slate-300 font-semibold uppercase">
                {String(latestReport.status)}
              </span>
              {latestReport.created_at
                ? ` · ${formatTraceTime(String(latestReport.created_at))}`
                : ""}
            </div>
          )}
          {actionStatus && <div className="mt-2 text-sm text-emerald-300">{actionStatus}</div>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-white/10 bg-black/20 overflow-hidden shadow-2xl">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5 bg-white/[0.01]">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Scope · Project
                </div>
                <h4 className="text-base font-bold text-white mt-0.5">Project Default Rules</h4>
                <p className="text-xs text-slate-500 mt-1">Baseline guardrails for all agents.</p>
              </div>
              <button
                onClick={() => setModalScope("project")}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-black uppercase tracking-wide text-slate-300 hover:bg-white/10 inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Rule
              </button>
            </div>
            {isAnyRulesLoading ? (
              <div className="px-4 py-6 text-sm text-slate-500">Loading rules...</div>
            ) : (
              <RuleList
                rules={projectRules}
                emptyMessage="No rules yet. Click New Rule to create a baseline guardrail."
              />
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-black/20 overflow-hidden shadow-2xl">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5 bg-white/[0.01]">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Scope · Agent
                </div>
                <h4 className="text-base font-bold text-white mt-0.5">Agent Override Rules</h4>
                <p className="text-xs text-slate-500 mt-1">Overrides for {agentId}.</p>
              </div>
              <button
                onClick={() => setModalScope("agent")}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-black uppercase tracking-wide text-slate-300 hover:bg-white/10 inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Rule
              </button>
            </div>
            {isAnyRulesLoading ? (
              <div className="px-4 py-6 text-sm text-slate-500">Loading rules...</div>
            ) : (
              <RuleList
                rules={agentRules}
                emptyMessage="No overrides yet. Click New Rule to add an agent-specific policy."
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
