'use client';

import React, { useState } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { Settings, Play, ShieldAlert, Timer, Zap, Database } from 'lucide-react';

interface RunConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRun: (config: RunConfig) => void;
    initialScope?: 'global' | 'chain' | 'node';
    targetId?: string;
}

export interface RunConfig {
    maxSteps: number;
    parallelExecution: boolean;
    baselineMode: 'none' | 'auto' | 'manual';
    stopOnError: boolean;
    scope: 'global' | 'chain' | 'node';
    targetId?: string;
}

export default function RunConfigModal({ isOpen, onClose, onRun, initialScope = 'global', targetId }: RunConfigModalProps) {
    const [config, setConfig] = useState<RunConfig>({
        maxSteps: 15,
        parallelExecution: true,
        baselineMode: 'none',
        stopOnError: false,
        scope: initialScope,
        targetId: targetId,
    });

    // Effect to update config when props change
    React.useEffect(() => {
        if (isOpen) {
            setConfig(prev => ({ ...prev, scope: initialScope, targetId }));
        }
    }, [isOpen, initialScope, targetId]);


    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Test Lab Execution Settings"
            size="md"
        >
            <div className="p-6 space-y-8 bg-[#0d0d12] text-slate-300">
                <section className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className="w-4 h-4 text-violet-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Safety & Constraints</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-slate-200 flex items-center gap-2">
                                    <Timer className="w-3.5 h-3.5 text-slate-500" />
                                    Max Steps
                                </label>
                                <input
                                    type="number"
                                    className="w-16 bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-violet-500/50"
                                    value={config.maxSteps}
                                    onChange={(e) => setConfig({ ...config, maxSteps: parseInt(e.target.value) || 1 })}
                                />
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight">
                                Hard-stop limit to prevent infinite loops in cyclic agents.
                            </p>
                        </div>

                        <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-slate-200 flex items-center gap-2">
                                    <Zap className="w-3.5 h-3.5 text-slate-500" />
                                    Parallel Run
                                </label>
                                <div
                                    className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${config.parallelExecution ? 'bg-violet-600' : 'bg-slate-700'}`}
                                    onClick={() => setConfig({ ...config, parallelExecution: !config.parallelExecution })}
                                >
                                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${config.parallelExecution ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight">
                                Allow agents with same order numbers to run simultaneously.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Database className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Baseline & Data</span>
                    </div>

                    <div className="space-y-3">
                        {['none', 'auto', 'manual'].map((mode) => (
                            <div
                                key={mode}
                                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${config.baselineMode === mode
                                    ? 'bg-emerald-500/10 border-emerald-500/30'
                                    : 'bg-black/40 border-white/5 hover:border-white/10'
                                    }`}
                                onClick={() => setConfig({ ...config, baselineMode: mode as any })}
                            >
                                <div>
                                    <div className="text-xs font-bold text-slate-100 uppercase tracking-tight">
                                        {mode === 'none' ? 'Fresh Run' : mode === 'auto' ? 'Automated Baseline' : 'Manual Reference'}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-1">
                                        {mode === 'none' && 'Run agents without historical performance data.'}
                                        {mode === 'auto' && 'Compare current results against the last successful runs.'}
                                        {mode === 'manual' && 'Manually select a "Golden Dataset" to verify against.'}
                                    </div>
                                </div>
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${config.baselineMode === mode ? 'border-emerald-500' : 'border-slate-700'
                                    }`}>
                                    {config.baselineMode === mode && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="pt-4 flex items-center justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button
                        className="px-8 bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-500/20"
                        onClick={() => onRun(config)}
                    >
                        <Play className="w-4 h-4 mr-2" />
                        Start Experiment
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
