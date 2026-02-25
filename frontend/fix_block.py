import codecs

path = 'c:/Users/user/Desktop/AgentGuard/frontend/components/live-view/ClinicalLog.tsx'

try:
    with codecs.open(path, 'r', 'utf-8') as f:
        lines = f.readlines()

    start_idx = -1
    end_idx = -1

    for i, line in enumerate(lines):
        if '{isExpanded && (' in line and start_idx == -1:
            if i > 0 and '<AnimatePresence>' in lines[i-1]:
                start_idx = i - 1  # include <AnimatePresence>
        if start_idx != -1 and ')}' in line and i > start_idx + 10:
            if i < len(lines)-1 and '</AnimatePresence>' in lines[i+1]:
                end_idx = i + 1  # include </AnimatePresence>
                break

    if start_idx == -1 or end_idx == -1:
        print("COULD NOT FIND BLOCK")
        exit(1)

    new_block = """                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="border-t border-white/5 bg-white/[0.02]"
                                    >
                                        <div className="p-8">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                                
                                                {/* Left Column: Core Data (Prompts, Output) */}
                                                <div className="lg:col-span-2 space-y-8">
                                                    {/* Meta Info */}
                                                    <div className="flex items-center gap-6 border-b border-white/5 pb-4">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">ID</span>
                                                            <span className="text-xs text-slate-300 font-mono tracking-wide">{s.id}</span>
                                                        </div>
                                                        <div className="h-6 w-px bg-white/10" />
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Trace</span>
                                                            <span className="text-xs text-slate-300 font-mono tracking-wide">{s.trace_id || '-'}</span>
                                                        </div>
                                                        <div className="h-6 w-px bg-white/10" />
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Model</span>
                                                            <span className="text-xs text-slate-300">{s.agent_id || '-'} / {normalizeModelVersion(s)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Content Sections */}
                                                    <div className="space-y-6">
                                                        <div>
                                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest block mb-3 pl-2 border-l-2 border-slate-600">System Prompt</span>
                                                            <div className="text-[13px] text-slate-300 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5 whitespace-pre-wrap">
                                                                {s.system_prompt || '-'}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest block mb-3 pl-2 border-l-2 border-slate-600">User Input</span>
                                                            <div className="text-[13px] text-slate-200 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5 whitespace-pre-wrap">
                                                                {s.request_prompt || s.user_message || '-'}
                                                            </div>
                                                        </div>
                                                        {customCode && (
                                                            <div>
                                                                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest block mb-3 pl-2 border-l-2 border-slate-600">Custom Code</span>
                                                                <div className="text-[13px] text-slate-400 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5 whitespace-pre-wrap">
                                                                    {customCode}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block mb-3 pl-2 border-l-2 border-emerald-500/50">Agent Response</span>
                                                            <div className="text-[13px] text-emerald-200 font-mono leading-relaxed bg-[#022c22]/30 p-4 rounded-xl border border-emerald-500/20 whitespace-pre-wrap">
                                                                {s.response_text || s.response || '-'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right Column: Execution Details */}
                                                <div className="space-y-8 lg:pl-8 lg:border-l lg:border-white/5">
                                                    
                                                    {/* Status & Metrics */}
                                                    <div className="space-y-4">
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Execution Details</span>
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between items-center py-2 border-b border-white/5 border-dashed">
                                                                <span className="text-slate-500">Status</span>
                                                                <span className={clsx(
                                                                    "px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded",
                                                                    successLike ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                                                                )}>
                                                                    {successLike ? 'Success' : 'Fail'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center py-2 border-b border-white/5 border-dashed">
                                                                <span className="text-slate-500">Timestamp</span>
                                                                <span className="text-slate-300 font-mono">{fullTime}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center py-2 border-b border-white/5 border-dashed">
                                                                <span className="text-slate-500">Tokens</span>
                                                                <span className="text-slate-300 font-mono">{s.tokens_used ?? '-'}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center py-2 border-b border-white/5 border-dashed">
                                                                <span className="text-slate-500">Cost</span>
                                                                <span className="text-slate-300 font-mono">{s.cost ?? '-'}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Step Logs */}
                                                    <div className="space-y-4">
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Execution Steps</span>
                                                        <div className="space-y-1">
                                                            {!stepLogs.length && <p className="text-sm text-slate-500 font-mono italic px-2">No steps recorded</p>}
                                                            {stepLogs.map((step, idx) => (
                                                                <div key={`${s.id}-step-${idx}`} className="flex flex-col py-2 border-b border-white/5 border-dashed">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={clsx(
                                                                                "w-2 h-2 rounded-full",
                                                                                step.status.includes('pass') || step.status.includes('success') ? "bg-emerald-500" :
                                                                                step.status.includes('fail') || step.status.includes('error') ? "bg-rose-500" : "bg-slate-500"
                                                                            )} />
                                                                            <span className="text-[13px] text-slate-300 font-medium truncate max-w-[140px]" title={step.name}>{step.name}</span>
                                                                        </div>
                                                                        <span className="text-xs text-slate-500 font-mono">{step.runtimeMs != null ? `${step.runtimeMs}ms` : ''}</span>
                                                                    </div>
                                                                    {step.detail && (
                                                                        <div className="text-xs text-slate-500 mt-1 pl-4 truncate">{step.detail}</div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Eval & Policy Checks */}
                                                    <div className="space-y-4">
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Checks & Validations</span>
                                                        <div className="space-y-2 bg-black/20 rounded-xl border border-white/5 p-3">
                                                            {/* Policy Single Row */}
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center justify-between py-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <ShieldCheck className="w-4 h-4 text-slate-400" />
                                                                        <span className="text-[13px] font-medium text-slate-300">Policy Validation</span>
                                                                    </div>
                                                                    <span className={clsx(
                                                                        "px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded",
                                                                        policyState.status === 'pass' ? "bg-emerald-500/10 text-emerald-400" :
                                                                        policyState.status === 'fail' ? "bg-rose-500/10 text-rose-400" : "bg-slate-500/10 text-slate-500"
                                                                    )}>
                                                                        {policyState.status}
                                                                    </span>
                                                                </div>
                                                                {policyState.status === 'fail' && policyState.message && (
                                                                    <div className="mt-2 text-xs text-rose-300 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 whitespace-pre-wrap break-words">
                                                                        {policyState.message}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            
                                                            {/* Eval Breakdown rows */}
                                                            {evalEnabled && evalRows.length > 0 && evalRows.map((row) => (
                                                                <div key={row.id} className="flex items-center justify-between py-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <Scale className="w-4 h-4 text-slate-400" />
                                                                        <span className="text-[13px] font-medium text-slate-300 truncate max-w-[140px]" title={EVAL_CHECK_LABELS[row.id]}>{EVAL_CHECK_LABELS[row.id] || row.id}</span>
                                                                    </div>
                                                                    <span className={clsx(
                                                                        "px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded",
                                                                        row.status === 'pass' ? "bg-emerald-500/10 text-emerald-400" :
                                                                        row.status === 'fail' ? "bg-rose-500/10 text-rose-400" : "bg-slate-500/10 text-slate-500"
                                                                    )}>
                                                                        {row.status}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            {evalEnabled && evalRows.length === 0 && (
                                                                <p className="text-xs text-slate-500 italic py-1">No eval configured</p>
                                                            )}
                                                        </div>
                                                        <div className="pt-2">
                                                            <button
                                                                onClick={() => runPolicyCheck(s)}
                                                                disabled={policyState.status === 'loading' || !s.trace_id || !configuredPolicies.length || !hasPolicyContext}
                                                                className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-white/10 disabled:opacity-50 transition flex items-center justify-center gap-2"
                                                            >
                                                                {policyState.status === 'loading' ? (
                                                                    <><Activity className="w-4 h-4 animate-spin" /> Running...</>
                                                                ) : (
                                                                     <><Target className="w-4 h-4" /> Re-run Validation</>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="pt-4 space-y-2">
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => downloadSnapshotJSON(s)}
                                                                className="flex-1 flex justify-center items-center gap-1.5 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] text-[11px] font-bold uppercase text-slate-400 transition"
                                                            >
                                                                <Download className="w-3.5 h-3.5" /> Export
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const value = String(s.trace_id || s.id || '');
                                                                    if (value) navigator.clipboard?.writeText(value).catch(() => undefined);
                                                                }}
                                                                className="flex-1 flex justify-center items-center gap-1.5 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] text-[11px] font-bold uppercase text-slate-400 transition"
                                                            >
                                                                <Copy className="w-3.5 h-3.5" /> Copy ID
                                                            </button>
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>\n"""

    lines = lines[:start_idx] + [new_block] + lines[end_idx+1:]
    
    with codecs.open(path, 'w', 'utf-8') as f:
        f.writelines(lines)
    print("SUCCESS")

except Exception as e:
    print(e)
