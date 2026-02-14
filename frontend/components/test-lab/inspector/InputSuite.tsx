'use client';

import React from 'react';
import { Database, MessageSquare, FileText, ChevronDown } from 'lucide-react';
import { InspectorSection } from './InspectorSection';

export interface InputSuiteProps {
    node: any;
    onUpdate: (data: any) => void;
}

export const InputSuite: React.FC<InputSuiteProps> = ({ node, onUpdate }) => {
    return (
        <div className="px-10 pb-10 space-y-8 flex flex-col h-full">
            <InspectorSection icon={Database} title="Patient Vault Integration" defaultOpen={true} accentColor="text-emerald-500">
                <div className="space-y-4 pt-4">
                    <div className="relative group/vault">
                        <select className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white appearance-none cursor-pointer focus:ring-1 focus:ring-emerald-500/50 font-black tracking-wider uppercase">
                            <option>Surgical Trace Vault #409</option>
                            <option>Clinical Baseline v2</option>
                            <option>Synthetic Adversarial Set</option>
                        </select>
                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-hover/vault:text-emerald-500 transition-colors pointer-events-none" />
                    </div>
                    <button className="w-full py-5 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-emerald-500/20 transition-all shadow-lg shadow-emerald-500/5 active:scale-95">
                        Sync Vault Repository
                    </button>
                </div>
            </InspectorSection>

            <div className="space-y-4">
                <div className="flex items-center gap-3 px-1">
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Clinical Input (Raw Payload)</label>
                </div>
                <textarea
                    value={node.data.textInput || ''}
                    onChange={(e) => onUpdate({ textInput: e.target.value })}
                    placeholder="Enter raw surgical data or patient history for evaluation..."
                    className="w-full h-80 bg-black/60 border border-white/10 rounded-[2.5rem] p-10 text-sm text-slate-300 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-emerald-500/50 outline-none scrollbar-hide shadow-2xl"
                />
            </div>

            <InspectorSection icon={FileText} title="Diagnostic Attachments" defaultOpen={false} accentColor="text-emerald-400">
                <div className="pt-4">
                    <div className="border-2 border-dashed border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center gap-4 hover:border-emerald-500/30 transition-all cursor-pointer bg-white/[0.01]">
                        <div className="p-4 rounded-full bg-emerald-500/5">
                            <FileText className="w-6 h-6 text-emerald-500/50" />
                        </div>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Drop DICOM or PDF Labs</span>
                    </div>
                </div>
            </InspectorSection>
        </div>
    );
};
