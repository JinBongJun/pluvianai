'use client';

import React from 'react';
import { Shield, Bell, User } from 'lucide-react';
import { InspectorSection } from './InspectorSection';

export interface ApprovalSuiteProps {
    node: any;
    onUpdate: (data: any) => void;
}

export const ApprovalSuite: React.FC<ApprovalSuiteProps> = ({ node, onUpdate }) => {
    return (
        <div className="px-10 pb-10 space-y-8 flex flex-col h-full">
            <InspectorSection icon={Shield} title="Human Oversight Protocol" defaultOpen={true} accentColor="text-blue-500">
                <div className="space-y-4 pt-4">
                    <div className="p-6 rounded-[2rem] bg-blue-500/5 border border-blue-500/20 group hover:bg-blue-500/10 transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-blue-500/10">
                                    <Bell className="w-6 h-6 text-blue-400" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-black text-slate-200 uppercase tracking-widest">Medical Alert (SMS)</span>
                                    <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest">Urgent Vetting Required</span>
                                </div>
                            </div>
                            <div className="w-12 h-6 bg-black rounded-full border border-white/10 p-1 relative cursor-pointer ring-1 ring-blue-500/20">
                                <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,1)]" />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Escalation Timer</span>
                            <span className="text-[11px] font-mono text-blue-400">15:00m</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 w-1/3 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                        </div>
                    </div>
                </div>
            </InspectorSection>

            <div className="space-y-4">
                <div className="flex items-center gap-3 px-1">
                    <User className="w-4 h-4 text-blue-500" />
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Oversight Context</label>
                </div>
                <textarea
                    value={node.data.context || ''}
                    onChange={(e) => onUpdate({ context: e.target.value })}
                    placeholder="Additional instructions for the human reviewer..."
                    className="w-full h-48 bg-black/60 border border-white/10 rounded-[2.5rem] p-8 text-sm text-slate-300 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-blue-500/50 outline-none scrollbar-hide shadow-inner"
                />
            </div>
        </div>
    );
};
