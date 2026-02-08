'use client';

import React, { useState } from 'react';
import { X, Zap, Ruler, Code, Shield } from 'lucide-react';
import { Button } from '../ui/Button';
import Modal from '../ui/Modal';

interface AddSignalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (signalType: string, defaultValue: any) => void;
}

type SignalCategory = 'rule' | 'metric' | 'llm' | 'custom';

interface SignalType {
    id: string;
    name: string;
    category: SignalCategory;
    description: string;
    defaultValue: any;
    cost: string;
}

const SIGNAL_TYPES: SignalType[] = [
    // Rule-based (Free, Fast)
    { id: 'length_change', name: 'Length Change', category: 'rule', description: 'Response length deviation from baseline', defaultValue: { threshold: 50 }, cost: 'Free' },
    { id: 'keyword_check', name: 'Keyword Check', category: 'rule', description: 'Required/forbidden keywords', defaultValue: { required: [], forbidden: [] }, cost: 'Free' },
    { id: 'json_schema', name: 'JSON Schema', category: 'rule', description: 'JSON validity + required fields', defaultValue: { schema: {} }, cost: 'Free' },
    { id: 'regex_pattern', name: 'Regex Pattern', category: 'rule', description: 'Pattern matching', defaultValue: { pattern: '' }, cost: 'Free' },

    // Metric-based (Free~Low cost)
    { id: 'rouge_score', name: 'ROUGE Score', category: 'metric', description: 'Text overlap with expected output', defaultValue: { threshold: 0.7 }, cost: 'Free' },
    { id: 'semantic_similarity', name: 'Semantic Similarity', category: 'metric', description: 'Meaning similarity', defaultValue: { threshold: 0.8 }, cost: '~$0.0001' },
    { id: 'token_limit', name: 'Token Limit', category: 'metric', description: 'Max output tokens', defaultValue: { limit: 4096 }, cost: 'Free' },
    { id: 'cost_limit', name: 'Cost Limit', category: 'metric', description: 'Max cost per call', defaultValue: { limit: 0.10 }, cost: 'Free' },
    { id: 'latency_limit', name: 'Latency Limit', category: 'metric', description: 'Max response time', defaultValue: { limit: 30 }, cost: 'Free' },

    // LLM-as-Judge (Higher cost)
    { id: 'custom_rubric', name: 'Custom Rubric', category: 'llm', description: 'Custom evaluation rubric', defaultValue: { rubric: '' }, cost: '~$0.005' },
    { id: 'factual_accuracy', name: 'Factual Accuracy', category: 'llm', description: 'RAG hallucination check', defaultValue: { enabled: true }, cost: '~$0.01' },
    { id: 'safety_check', name: 'Safety Check', category: 'llm', description: 'Toxicity, PII detection', defaultValue: { enabled: true }, cost: '~$0.003' },

    // Custom Code
    { id: 'webhook', name: 'Webhook', category: 'custom', description: 'External API evaluation', defaultValue: { url: '' }, cost: 'Free' },
];

const CATEGORY_INFO = {
    rule: { label: 'Rule-based', icon: Ruler, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    metric: { label: 'Metric-based', icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    llm: { label: 'LLM-as-Judge', icon: Shield, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
    custom: { label: 'Custom Code', icon: Code, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
};

export default function AddSignalModal({ isOpen, onClose, onAdd }: AddSignalModalProps) {
    const [selectedCategory, setSelectedCategory] = useState<SignalCategory | 'all'>('all');
    const [selectedSignal, setSelectedSignal] = useState<string | null>(null);

    const filteredSignals = selectedCategory === 'all'
        ? SIGNAL_TYPES
        : SIGNAL_TYPES.filter(s => s.category === selectedCategory);

    const handleAdd = () => {
        const signal = SIGNAL_TYPES.find(s => s.id === selectedSignal);
        if (signal) {
            onAdd(signal.id, signal.defaultValue);
            setSelectedSignal(null);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Signal">
            <div className="space-y-6">
                {/* Category Filter */}
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedCategory === 'all'
                            ? 'bg-white/10 text-white border border-white/20'
                            : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                            }`}
                    >
                        All
                    </button>
                    {Object.entries(CATEGORY_INFO).map(([key, info]) => {
                        const Icon = info.icon;
                        return (
                            <button
                                key={key}
                                onClick={() => setSelectedCategory(key as SignalCategory)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${selectedCategory === key
                                    ? `${info.bg} ${info.color} border ${info.border}`
                                    : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {info.label}
                            </button>
                        );
                    })}
                </div>

                {/* Signal List */}
                <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                    {filteredSignals.map(signal => {
                        const categoryInfo = CATEGORY_INFO[signal.category];
                        const Icon = categoryInfo.icon;
                        return (
                            <button
                                key={signal.id}
                                onClick={() => setSelectedSignal(signal.id)}
                                className={`w-full text-left p-4 rounded-xl border transition-all ${selectedSignal === signal.id
                                    ? `${categoryInfo.bg} ${categoryInfo.border} ring-2 ring-${signal.category === 'rule' ? 'blue' : signal.category === 'metric' ? 'emerald' : signal.category === 'llm' ? 'violet' : 'orange'}-500/30`
                                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1">
                                        <Icon className={`w-5 h-5 mt-0.5 ${categoryInfo.color}`} />
                                        <div className="flex-1">
                                            <div className="font-semibold text-white text-base">{signal.name}</div>
                                            <div className="text-sm text-slate-400 mt-1">{signal.description}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono whitespace-nowrap">{signal.cost}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-white/10">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        className="flex-1"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleAdd}
                        disabled={!selectedSignal}
                        className="flex-1"
                    >
                        Add Signal
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
