'use client';

import React from 'react';
import clsx from 'clsx';
import { X, Plus, Trash2, FileCode2 } from 'lucide-react';
import { type BehaviorRule, type RuleJSON } from '@/lib/api';

type RuleType = RuleJSON['type'];
type RuleScope = 'project' | 'agent';
type Severity = 'low' | 'medium' | 'high' | 'critical';

type CreateRulePayload = Omit<BehaviorRule, 'id' | 'created_at' | 'updated_at' | 'project_id'>;

const RULE_TABS: Array<{ id: RuleType; label: string }> = [
  { id: 'tool_forbidden', label: 'tool forbidden' },
  { id: 'tool_allowlist', label: 'tool allowlist' },
  { id: 'tool_order', label: 'tool order' },
  { id: 'tool_args_schema', label: 'tool args schema' },
];

type PolicyRuleModalProps = {
  isOpen: boolean;
  initialScopeType: RuleScope;
  agentId?: string;
  onClose: () => void;
  onSave: (payload: CreateRulePayload) => Promise<void>;
};

function parseSchemaText(text: string): { value: Record<string, unknown> | null; error: string | null } {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: 'Schema must be a JSON object.' };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: null, error: 'Invalid JSON schema.' };
  }
}

export function PolicyRuleModal({
  isOpen,
  initialScopeType,
  agentId,
  onClose,
  onSave,
}: PolicyRuleModalProps) {
  const [selectedScope, setSelectedScope] = React.useState<RuleScope>('project');
  const [ruleType, setRuleType] = React.useState<RuleType>('tool_forbidden');
  const [name, setName] = React.useState('');
  const [severity, setSeverity] = React.useState<Severity>('high');
  const [description, setDescription] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);

  const [toolInput, setToolInput] = React.useState('');
  const [tools, setTools] = React.useState<string[]>([]);

  const [orderPairs, setOrderPairs] = React.useState<Array<{ tool: string; before_tool: string }>>([
    { tool: '', before_tool: '' },
  ]);

  const [targetTool, setTargetTool] = React.useState('');
  const [schemaText, setSchemaText] = React.useState('{\n  "type": "object",\n  "properties": {},\n  "required": []\n}');

  const [saveError, setSaveError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setSelectedScope(initialScopeType);
    setRuleType('tool_forbidden');
    setName('');
    setSeverity('high');
    setDescription('');
    setEnabled(true);
    setToolInput('');
    setTools([]);
    setOrderPairs([{ tool: '', before_tool: '' }]);
    setTargetTool('');
    setSchemaText('{\n  "type": "object",\n  "properties": {},\n  "required": []\n}');
    setSaveError('');
    setIsSaving(false);
  }, [isOpen, initialScopeType, agentId]);

  const schemaState = React.useMemo(() => parseSchemaText(schemaText), [schemaText]);

  const spec = React.useMemo<Record<string, unknown>>(() => {
    if (ruleType === 'tool_forbidden' || ruleType === 'tool_allowlist') {
      return { tools };
    }
    if (ruleType === 'tool_order') {
      return {
        must_happen_before: orderPairs
          .map((p) => ({ tool: p.tool.trim(), before_tool: p.before_tool.trim() }))
          .filter((p) => p.tool && p.before_tool),
      };
    }
    return {
      tool: targetTool.trim(),
      json_schema: schemaState.value || {},
    };
  }, [ruleType, tools, orderPairs, targetTool, schemaState.value]);

  const ruleJson = React.useMemo<RuleJSON>(() => {
    return {
      type: ruleType,
      name: name.trim() || 'Rule Name',
      severity,
      spec,
    };
  }, [ruleType, name, severity, spec]);

  const validationError = React.useMemo(() => {
    if (!name.trim()) return 'Rule name is required.';
    if (ruleType === 'tool_forbidden' || ruleType === 'tool_allowlist') {
      if (tools.length === 0) return 'Add at least one tool.';
    }
    if (ruleType === 'tool_order') {
      const validPairs = (spec.must_happen_before as Array<{ tool: string; before_tool: string }> | undefined) || [];
      if (validPairs.length === 0) return 'Add at least one valid tool order constraint.';
    }
    if (ruleType === 'tool_args_schema') {
      if (!targetTool.trim()) return 'Target tool is required.';
      if (schemaState.error) return schemaState.error;
    }
    return '';
  }, [name, ruleType, tools.length, targetTool, schemaState.error, spec]);

  const handleAddTool = () => {
    const value = toolInput.trim();
    if (!value) return;
    if (tools.includes(value)) {
      setToolInput('');
      return;
    }
    setTools((prev) => [...prev, value]);
    setToolInput('');
  };

  const handleSave = async () => {
    if (validationError || isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        scope_type: selectedScope,
        scope_ref: selectedScope === 'agent' ? agentId || null : null,
        severity_default: severity,
        rule_json: ruleJson,
        enabled,
      });
      onClose();
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail || 'Failed to save rule. Please retry.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e] shadow-[0_30px_100px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <h3 className="text-3xl font-black text-white tracking-tight">
            {selectedScope === 'project' ? 'New Project Default Rule' : 'New Agent Override Rule'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-white/10 bg-[#02081a] flex items-center justify-between">
          <div>
            <h4 className="text-3xl font-black text-white">Create Policy Rule</h4>
            <p className="text-sm text-slate-400 mt-1">Define enforceable guardrails and validate tool usage behavior.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={Boolean(validationError) || isSaving}
              className={clsx(
                'px-5 py-2 rounded-lg text-sm font-bold transition-colors',
                validationError || isSaving
                  ? 'bg-emerald-700/50 text-emerald-100/70 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              )}
            >
              {isSaving ? 'Saving...' : 'Save Rule'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[58%_42%] max-h-[80vh] overflow-hidden">
          <div className="overflow-y-auto custom-scrollbar p-6 space-y-6 border-r border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                  Rule Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Safety Rule"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe the purpose of this rule..."
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
              />
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl font-black text-slate-200">Validation Logic</span>
                <div className="flex flex-wrap gap-2">
                  {RULE_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setRuleType(tab.id)}
                      className={clsx(
                        'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors',
                        ruleType === tab.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-black/30 text-slate-300 border border-white/10 hover:bg-white/5'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {(ruleType === 'tool_forbidden' || ruleType === 'tool_allowlist') && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className={clsx(
                    'rounded-xl px-4 py-3 border text-sm',
                    ruleType === 'tool_forbidden'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  )}>
                    {ruleType === 'tool_forbidden'
                      ? 'Forbidden Tools: specify tools that must never be called.'
                      : 'Allowed Tools (Allowlist): only these tools may be called.'}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={toolInput}
                      onChange={(e) => setToolInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTool();
                        }
                      }}
                      placeholder={ruleType === 'tool_forbidden' ? 'e.g. shell.exec' : 'e.g. search'}
                      className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
                    />
                    <button
                      onClick={handleAddTool}
                      className="px-4 py-3 rounded-xl bg-white/10 text-slate-200 hover:bg-white/15 text-sm font-semibold"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {tools.length === 0 && <p className="text-xs text-slate-500 italic">No tools added yet.</p>}
                    {tools.map((tool) => (
                      <div key={tool} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                        <span className="text-sm text-slate-200 font-mono">{tool}</span>
                        <button
                          onClick={() => setTools((prev) => prev.filter((t) => t !== tool))}
                          className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-white/5"
                          aria-label={`Remove ${tool}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ruleType === 'tool_order' && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className="rounded-xl px-4 py-3 border bg-amber-500/10 border-amber-500/30 text-amber-200 text-sm">
                    Tool Order Constraints: enforce specific sequence of tool execution.
                  </div>
                  <div className="space-y-2">
                    {orderPairs.map((pair, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                        <input
                          value={pair.tool}
                          onChange={(e) => {
                            const value = e.target.value;
                            setOrderPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, tool: value } : p)));
                          }}
                          placeholder="First tool (e.g. search)"
                          className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
                        />
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">before</span>
                        <input
                          value={pair.before_tool}
                          onChange={(e) => {
                            const value = e.target.value;
                            setOrderPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, before_tool: value } : p)));
                          }}
                          placeholder="Second tool (e.g. answer)"
                          className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
                        />
                        <button
                          onClick={() => setOrderPairs((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                          className="p-2 rounded text-slate-400 hover:text-rose-300 hover:bg-white/5"
                          aria-label="Remove constraint row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setOrderPairs((prev) => [...prev, { tool: '', before_tool: '' }])}
                    className="w-full px-4 py-3 rounded-xl border border-dashed border-white/15 text-sm text-slate-300 hover:bg-white/5 inline-flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Sequence Constraint
                  </button>
                </div>
              )}

              {ruleType === 'tool_args_schema' && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className="rounded-xl px-4 py-3 border bg-sky-500/10 border-sky-500/30 text-sky-200 text-sm">
                    Argument Schema Validation: validate tool arguments against a JSON schema.
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                      Target Tool
                    </label>
                    <input
                      value={targetTool}
                      onChange={(e) => setTargetTool(e.target.value)}
                      placeholder="e.g. create_user"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                      JSON Schema
                    </label>
                    <textarea
                      rows={8}
                      value={schemaText}
                      onChange={(e) => setSchemaText(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-500/40"
                    />
                    {schemaState.error && <p className="mt-2 text-xs text-rose-300">{schemaState.error}</p>}
                  </div>
                </div>
              )}
            </div>

            {validationError && <p className="text-sm text-rose-300">{validationError}</p>}
            {saveError && <p className="text-sm text-rose-300">{saveError}</p>}
          </div>

          <div className="overflow-y-auto custom-scrollbar bg-black/35">
            <div className="px-5 py-4 border-b border-white/10 text-xs font-black uppercase tracking-[0.25em] text-slate-500 inline-flex items-center gap-2">
              <FileCode2 className="w-4 h-4" />
              JSON Preview
            </div>
            <pre className="p-5 text-xs leading-relaxed font-mono text-emerald-300 whitespace-pre-wrap">
{`${JSON.stringify(ruleJson, null, 2)}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

