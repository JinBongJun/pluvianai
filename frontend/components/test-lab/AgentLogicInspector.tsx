'use client';

import React, { useState, useMemo } from 'react';
import { Node, Edge } from 'reactflow';
import { TestLabBoxNodeData } from './TestLabBoxNode';
import { OutputNodeData } from './OutputNode';
import { InputNodeData } from './InputNode';
import { Bot, ChevronDown, ChevronRight, Link as LinkIcon, Play, Zap, Settings, X, Edit2, Database } from 'lucide-react';
import { Button } from '../ui/Button';
import { Signal } from '@/lib/schemas';
import AddSignalModal from './AddSignalModal';

interface AgentLogicInspectorProps {
    selectedNode: Node<TestLabBoxNodeData | OutputNodeData | InputNodeData>;
    nodes: Node<TestLabBoxNodeData | OutputNodeData | InputNodeData>[];
    edges: Edge[];
    onUpdateNode: (id: string, data: Partial<TestLabBoxNodeData | OutputNodeData>) => void;
    onUpdateEdge: (id: string, data: any) => void;
    onDeleteEdge: (id: string) => void;
    onRunAgent: (id: string) => void;
    onRunChain: (id: string) => void;
    activeTab: string;
}

const DEFAULT_SIGNALS: Signal[] = [
    { id: 'latency', type: 'latency_limit', label: 'Latency Limit', value: '30s', editable: true },
    { id: 'token', type: 'token_limit', label: 'Token Limit', value: '4096', editable: true },
    { id: 'cost', type: 'cost_limit', label: 'Cost Limit', value: '$0.10', editable: true },
    { id: 'length', type: 'length_change', label: 'Length Change', value: '±50%', editable: true },
    { id: 'json', type: 'json_schema', label: 'JSON Schema', value: '(none)', editable: false },
];

export default function AgentLogicInspector({
    selectedNode,
    nodes,
    edges,
    onUpdateNode,
    onRunAgent,
    onRunChain,
    activeTab,
}: AgentLogicInspectorProps) {
    const [openSections, setOpenSections] = useState({
        configuration: true,
        testData: false,
        signals: false,
        connections: false,
    });

    const [signals, setSignals] = useState<Signal[]>(DEFAULT_SIGNALS);
    const [isAddSignalOpen, setIsAddSignalOpen] = useState(false);
    const [editingSignal, setEditingSignal] = useState<string | null>(null);
    const [testDataCount, setTestDataCount] = useState(0);

    const toggleSection = (section: keyof typeof openSections) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const handleAddSignal = (signalType: string, defaultValue: any) => {
        const signalLabels: Record<string, string> = {
            'length_change': 'Length Change',
            'keyword_check': 'Keyword Check',
            'json_schema': 'JSON Schema',
            'regex_pattern': 'Regex Pattern',
            'rouge_score': 'ROUGE Score',
            'semantic_similarity': 'Semantic Similarity',
            'token_limit': 'Token Limit',
            'cost_limit': 'Cost Limit',
            'latency_limit': 'Latency Limit',
            'custom_rubric': 'Custom Rubric',
            'factual_accuracy': 'Factual Accuracy',
            'safety_check': 'Safety Check',
            'webhook': 'Webhook',
        };

        const newSignal: Signal = {
            id: `${signalType}_${Date.now()}`,
            type: signalType,
            label: signalLabels[signalType] || signalType,
            value: JSON.stringify(defaultValue),
            editable: true,
        };

        setSignals(prev => [...prev, newSignal]);
    };

    const handleRemoveSignal = (id: string) => {
        setSignals(prev => prev.filter(s => s.id !== id));
    };

    // Derive connections
    const incomingEdges = useMemo(() => edges.filter(e => e.target === selectedNode.id), [edges, selectedNode.id]);
    const outgoingEdges = useMemo(() => edges.filter(e => e.source === selectedNode.id), [edges, selectedNode.id]);
    const getAgentLabel = (id: string) => nodes.find(n => n.id === id)?.data.label || 'Unknown';

    if (activeTab !== 'details') {
        return (
            <div className="flex flex-col h-full bg-[#0d0d12] text-slate-300 overflow-hidden">
                <div className="flex-1 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Results will appear here</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0d12] text-slate-300 overflow-hidden">
            {/* Header with Agent Name */}
            <div className="px-8 py-6 border-b border-white/5">
                <div className="flex items-center gap-3 mb-4">
                    {selectedNode.type === 'outputNode' ? (
                        <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
                    ) : selectedNode.type === 'inputNode' ? (
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                    ) : (
                        <div className="w-3 h-3 rounded-full bg-violet-500/70 shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
                    )}
                    <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                        {selectedNode.type === 'outputNode' ? 'Evaluation Logic' :
                            selectedNode.type === 'inputNode' ? 'Input Dataset' :
                                selectedNode.data.label}
                    </h2>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <Button
                        onClick={() => onRunAgent(selectedNode.id)}
                        className="flex-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 h-11 text-sm font-semibold transition-all"
                    >
                        <Play className="w-4 h-4 mr-2 fill-emerald-500/20" />
                        Test Agent
                    </Button>
                    <Button
                        onClick={() => onRunChain(selectedNode.id)}
                        className="flex-1 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 border border-violet-500/20 h-11 text-sm font-semibold transition-all"
                    >
                        <Zap className="w-4 h-4 mr-2 fill-violet-500/20" />
                        Run Chain
                    </Button>
                </div>
            </div>

            {/* Scrollable Accordion Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Configuration Section - Agent Only */}
                {selectedNode.type === 'testLabBox' && (
                    <div className="border-b border-white/5">
                        <button
                            onClick={() => toggleSection('configuration')}
                            className="w-full px-8 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Bot className="w-5 h-5 text-violet-400" />
                                <span className="text-base font-semibold text-white">Configuration</span>
                            </div>
                            {openSections.configuration ? (
                                <ChevronDown className="w-5 h-5 text-slate-500" />
                            ) : (
                                <ChevronRight className="w-5 h-5 text-slate-500" />
                            )}
                        </button>

                        {openSections.configuration && (
                            <div className="px-8 pb-6 space-y-6">
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-slate-400">Model</label>
                                    <select
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base text-slate-200 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all cursor-pointer"
                                        value={(selectedNode.data as TestLabBoxNodeData).model}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { model: e.target.value })}
                                    >
                                        <option value="gpt-4o">gpt-4o (Recommended)</option>
                                        <option value="gpt-4o-mini">gpt-4o-mini (Fast)</option>
                                        <option value="gpt-3.5-turbo">gpt-3.5-turbo (Legacy)</option>
                                    </select>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-slate-400">System Prompt</label>
                                    <textarea
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-base text-slate-200 leading-relaxed min-h-[240px] focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all resize-y placeholder:text-slate-600"
                                        placeholder="Define the agent's role and behavior..."
                                        value={(selectedNode.data as TestLabBoxNodeData).systemPrompt || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { systemPrompt: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Eval Node Specific UI */}
                {selectedNode.type === 'outputNode' && (
                    <div className="border-b border-white/5">
                        <button
                            onClick={() => toggleSection('signals')}
                            className="w-full px-8 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Zap className="w-5 h-5 text-blue-400" />
                                <span className="text-base font-semibold text-white">Active Signals</span>
                                <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-full">
                                    {(selectedNode.data as OutputNodeData).signals?.length || 0} active
                                </span>
                            </div>
                            {openSections.signals ? (
                                <ChevronDown className="w-5 h-5 text-slate-500" />
                            ) : (
                                <ChevronRight className="w-5 h-5 text-slate-500" />
                            )}
                        </button>

                        {openSections.signals && (
                            <div className="px-8 pb-6 space-y-3">
                                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-4">
                                    <p className="text-sm text-blue-300">
                                        These signals define how the Judge evaluates the agent&apos;s output.
                                    </p>
                                </div>
                                {signals.map((signal) => (
                                    <div key={signal.id} className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10 group">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm text-slate-300">{signal.label || signal.name || 'Signal'}: </span>
                                            {editingSignal === signal.id ? (
                                                <input
                                                    type="text"
                                                    defaultValue={signal.value}
                                                    onBlur={(e) => {
                                                        const newSignals = signals.map(s =>
                                                            s.id === signal.id ? { ...s, value: e.target.value } : s
                                                        );
                                                        setSignals(newSignals);
                                                        // Update node data immediately
                                                        onUpdateNode(selectedNode.id, { signals: newSignals });
                                                        setEditingSignal(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const newSignals = signals.map(s =>
                                                                s.id === signal.id ? { ...s, value: e.currentTarget.value } : s
                                                            );
                                                            setSignals(newSignals);
                                                            onUpdateNode(selectedNode.id, { signals: newSignals });
                                                            setEditingSignal(null);
                                                        }
                                                    }}
                                                    autoFocus
                                                    className="bg-white/10 border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none"
                                                />
                                            ) : (
                                                <span className="text-sm font-medium text-slate-200">{signal.value}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {signal.editable && (
                                                <button
                                                    onClick={() => setEditingSignal(signal.id)}
                                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    const newSignals = signals.filter(s => s.id !== signal.id);
                                                    setSignals(newSignals);
                                                    onUpdateNode(selectedNode.id, { signals: newSignals });
                                                }}
                                                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                            >
                                                <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setIsAddSignalOpen(true)}
                                    className="w-full mt-4 px-4 py-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 rounded-xl text-sm text-blue-400 font-medium transition-all"
                                >
                                    + Add New Signal Rule
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Input Node Specific UI (Dataset Variables) */}
                {selectedNode.type === 'inputNode' && (
                    <div className="border-b border-white/5">
                        <button
                            onClick={() => toggleSection('testData')}
                            className="w-full px-8 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Database className="w-5 h-5 text-emerald-400" />
                                <span className="text-base font-semibold text-white">Dataset Variables</span>
                                <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-full">
                                    {(selectedNode.data as InputNodeData).variables?.length || 0} vars
                                </span>
                            </div>
                            {openSections.testData ? (
                                <ChevronDown className="w-5 h-5 text-slate-500" />
                            ) : (
                                <ChevronRight className="w-5 h-5 text-slate-500" />
                            )}
                        </button>

                        {openSections.testData && (
                            <div className="px-8 pb-6 space-y-4">
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4">
                                    <p className="text-sm text-emerald-300">
                                        Define variables that will be injected into your Agent prompts (e.g. {"{{query}}"}).
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {(selectedNode.data as InputNodeData).variables?.map((v: any) => (
                                        <div key={v.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded">
                                                    {`{{${v.name}}}`}
                                                </span>
                                                <span className="text-xs text-slate-500 capitalize">({v.type})</span>
                                            </div>
                                        </div>
                                    ))}
                                    <Button
                                        onClick={(selectedNode.data as InputNodeData).onEdit}
                                        className="w-full mt-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 py-2.5 text-xs font-semibold"
                                    >
                                        Edit Dataset ({(selectedNode.data as InputNodeData).testCases?.length || 0} Test Cases)
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Agent Node Specific UI (Configuration) */}


                {/* Content based on Node Type */}
                {selectedNode.type === 'testLabBox' && (
                    <div className="space-y-6">
                        {/* Collapsible Sections */}
                        <div className="border-b border-white/5">
                            <button
                                onClick={() => toggleSection('connections')}
                                className="w-full px-8 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <LinkIcon className="w-5 h-5 text-slate-400" />
                                    <span className="text-base font-semibold text-white">Connections</span>
                                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-full">
                                        {incomingEdges.length + outgoingEdges.length}
                                    </span>
                                </div>
                                {openSections.connections ? (
                                    <ChevronDown className="w-5 h-5 text-slate-500" />
                                ) : (
                                    <ChevronRight className="w-5 h-5 text-slate-500" />
                                )}
                            </button>

                            {openSections.connections && (
                                <div className="px-8 pb-6 space-y-4">
                                    {incomingEdges.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-medium text-slate-500">Input from:</div>
                                            {incomingEdges.map(edge => (
                                                <div key={edge.id} className="px-4 py-2 bg-white/5 rounded-lg text-sm text-slate-300">
                                                    {getAgentLabel(edge.source)}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {outgoingEdges.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-medium text-slate-500">Output to:</div>
                                            {outgoingEdges.map(edge => (
                                                <div key={edge.id} className="px-4 py-2 bg-white/5 rounded-lg text-sm text-slate-300 flex items-center justify-between">
                                                    <span>{getAgentLabel(edge.target)}</span>
                                                    {edge.data?.order && (
                                                        <span className="text-xs text-slate-500">Order: {edge.data.order}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
                                        <div className="text-sm text-slate-500 text-center py-4">No connections</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Add Signal Modal */}
            <AddSignalModal
                isOpen={isAddSignalOpen}
                onClose={() => setIsAddSignalOpen(false)}
                onAdd={handleAddSignal}
            />
        </div >
    );
}
