'use client';

import React from 'react';
import { Activity, LineChart } from 'lucide-react';
import clsx from 'clsx';
import { InspectorSection } from './InspectorSection';

export interface EvalSuiteProps {
    node: any;
    onUpdate: (data: any) => void;
}

export const EvalSuite: React.FC<EvalSuiteProps> = ({ node, onUpdate }) => {
    const diagnosticFactors = [
        { id: 'hallucination', label: 'Hallucination', type: 'Safety', val: 0.12, color: 'bg-rose-500' },
        { id: 'accuracy', label: 'Accuracy', type: 'Clinical', val: 0.94, color: 'bg-emerald-500' },
        { id: 'length', label: 'Length Change', type: 'Structure', val: 0.05, color: 'bg-cyan-500' },
        { id: 'refusal', label: 'Refusal Rate', type: 'Safety', val: 0.02, color: 'bg-amber-500' },
        { id: 'schema', label: 'Schema Integrity', type: 'Structure', val: 1.0, color: 'bg-blue-500' },
        { id: 'latency', label: 'Latency Spike', type: 'Performance', val: 0.08, color: 'bg-violet-500' },
        { id: 'cost', label: 'Token Economy', type: 'Performance', val: 0.15, color: 'bg-indigo-500' },
        { id: 'semantic', label: 'Semantic Drift', type: 'Quality', val: 0.1, color: 'bg-fuchsia-500' },
        { id: 'validator', label: 'Reg. Validator', type: 'Compliance', val: 0.88, color: 'bg-sky-500' },
        { id: 'consistency', label: 'Consistency', type: 'Quality', val: 0.91, color: 'bg-teal-500' },
        { id: 'tone', label: 'Clinical Tone', type: 'Brand', val: 0.85, color: 'bg-orange-500' },
        { id: 'coherence', label: 'Reasoning Coherence', type: 'Logic', val: 0.82, color: 'bg-yellow-500' },
        { id: 'custom', label: 'Custom Signal (PiI)', type: 'Privacy', val: 0.0, color: 'bg-neutral-500' },
    ];

    return (
        <div className="px-10 pb-10 space-y-6 flex flex-col h-full">
            <InspectorSection icon={Activity} title="13 Clinical Diagnostic Factors" defaultOpen={true} accentColor="text-cyan-500">
                <div className="grid grid-cols-1 gap-4 pt-4">
                    {diagnosticFactors.map((sig) => (
                        <div key={sig.id} className="p-5 rounded-2xl bg-black/40 border border-white/10 hover:border-cyan-500/30 transition-all group/factor">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex flex-col">
                                    <span className="text-[12px] font-black text-white uppercase tracking-wider group-hover/factor:text-cyan-400 transition-colors">{sig.label}</span>
                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{sig.type} Protocol</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xl font-black text-slate-300 font-mono">{(sig.val * 10).toFixed(1)}</span>
                                    <div className="w-8 h-4 bg-black rounded-full border border-white/10 p-1 relative cursor-pointer">
                                        <div className="absolute right-1 top-1 w-2 h-2 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50" />
                                    </div>
                                </div>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={clsx("h-full", sig.color)} style={{ width: `${sig.val * 100}%` }} />
                            </div>
                        </div>
                    ))}
                    <button className="w-full py-4 border border-dashed border-white/10 rounded-2xl text-[10px] font-black text-slate-500 hover:text-cyan-400 hover:border-cyan-400/50 transition-all uppercase tracking-[0.3em] bg-white/[0.01] shadow-lg">+ Deploy Custom Sensor</button>
                </div>
            </InspectorSection>
        </div>
    );
};
