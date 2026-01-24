'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { replayAPI, apiCallsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Play, History, Split, ArrowRight, Settings2, Trash2 } from 'lucide-react';
import ProjectTabs from '@/components/ProjectTabs';
import { clsx } from 'clsx';

export default function ReplayPage() {
    const router = useRouter();
    const params = useParams();
    const toast = useToast();
    const projectId = Number(params.projectId);

    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [replaying, setReplaying] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [results, setResults] = useState<any[]>([]);

    // Overrides
    const [targetModel, setTargetModel] = useState('');
    const [targetPrompt, setTargetPrompt] = useState('');

    useEffect(() => {
        loadSnapshots();
    }, [projectId]);

    const loadSnapshots = async () => {
        setLoading(true);
        try {
            // In a real app, we'd have a specific /snapshots endpoint, 
            // but for MVP we list API calls and show which ones are replayable.
            const data = await apiCallsAPI.list(projectId, { limit: 20 });
            setSnapshots(data);
        } catch (err) {
            toast.showToast('Failed to load historical logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRunReplay = async () => {
        if (selectedIds.length === 0) {
            toast.showToast('Select at least one log to replay', 'warning');
            return;
        }

        setReplaying(true);
        try {
            const replayResults = await replayAPI.runBatchReplay(projectId, {
                snapshot_ids: selectedIds,
                new_model: targetModel || undefined,
                new_system_prompt: targetPrompt || undefined
            });
            setResults(replayResults);
            toast.showToast(`Batch replay of ${selectedIds.length} items completed`, 'success');
        } catch (err: any) {
            toast.showToast(err.response?.data?.detail || 'Replay failed', 'error');
        } finally {
            setReplaying(false);
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    return (
        <DashboardLayout>
            <div className="bg-[#000314] min-h-screen text-white">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold flex items-center gap-3">
                            <History className="h-10 w-10 text-purple-500" />
                            Time Machine <span className="text-slate-500 text-lg font-normal">(Replay Engine)</span>
                        </h1>
                        <p className="text-slate-400 mt-2">Re-run production traffic with new prompts & models to detect regressions.</p>
                    </div>

                    <Button
                        onClick={handleRunReplay}
                        disabled={replaying || selectedIds.length === 0}
                        isLoading={replaying}
                        className="px-8 py-6 text-lg font-bold"
                    >
                        <Play className="h-5 w-5 mr-2 fill-current" />
                        RUN REPLAY ({selectedIds.length})
                    </Button>
                </div>

                <ProjectTabs projectId={projectId} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">

                    {/* Left: Configuration & Selection */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="border border-white/10 rounded-2xl bg-white/5 p-6 backdrop-blur-sm">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                <Settings2 className="h-5 w-5 text-slate-400" />
                                Override Settings
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Target Model</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. gpt-4o-mini, claude-3-5-sonnet"
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-purple-500 transition-colors"
                                        value={targetModel}
                                        onChange={e => setTargetModel(e.target.value)}
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1">Leave empty to keep original model.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 uppercase mb-2">New System Prompt</label>
                                    <textarea
                                        rows={4}
                                        placeholder="Enter new system instructions..."
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-purple-500 transition-colors"
                                        value={targetPrompt}
                                        onChange={e => setTargetPrompt(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="border border-white/10 rounded-2xl bg-white/5 overflow-hidden">
                            <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
                                <h3 className="font-semibold text-sm">Select Logs to Replay</h3>
                                <span className="text-xs text-slate-500">{snapshots.length} available</span>
                            </div>
                            <div className="max-h-[500px] overflow-y-auto">
                                {loading ? (
                                    <div className="p-8 text-center animate-pulse text-slate-500 italic">Finding logs...</div>
                                ) : snapshots.map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => toggleSelect(s.id)}
                                        className={clsx(
                                            "p-4 border-b border-white/5 cursor-pointer transition-colors hover:bg-white/5",
                                            selectedIds.includes(s.id) && "bg-purple-500/10 border-l-4 border-l-purple-500"
                                        )}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <Badge variant="default" className="text-[10px]">{s.model}</Badge>
                                            <span className="text-[10px] text-slate-500">{new Date(s.created_at).toLocaleTimeString()}</span>
                                        </div>
                                        <p className="text-sm line-clamp-1 text-slate-300 font-mono italic">
                                            &quot;{s.request_prompt || 'No prompt stored'}&quot;
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Side-by-Side Results */}
                    <div className="lg:col-span-2">
                        {!results.length ? (
                            <div className="h-[600px] border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-slate-500">
                                <Split className="h-16 w-16 mb-4 opacity-20" />
                                <p className="max-w-[280px] text-center italic">Select logs on the left and click &quot;Run Replay&quot; to see side-by-side comparisons.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {results.map((res, index) => {
                                    const original = snapshots.find(s => s.id === res.snapshot_id);
                                    return (
                                        <div key={index} className="border border-white/10 rounded-2xl bg-gradient-to-br from-white/5 to-transparent overflow-hidden shadow-xl">
                                            <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/10">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant={res.success ? "success" : "error"}>
                                                        {res.success ? "REPLAY SUCCESS" : "FAILED"}
                                                    </Badge>
                                                    <span className="text-xs text-slate-400 font-mono">Trace ID: {original?.chain_id || 'manual-v1'}</span>
                                                </div>
                                                <div className="text-xs text-slate-400 flex items-center gap-2">
                                                    <span className="text-slate-500">{original?.model}</span>
                                                    <ArrowRight className="h-3 w-3" />
                                                    <span className="text-purple-400 font-bold">{res.replay_model}</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-white/10">
                                                {/* Original Output */}
                                                <div className="p-5">
                                                    <p className="text-[10px] text-slate-500 uppercase font-black mb-3 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                                                        Production Output (Original)
                                                    </p>
                                                    <div className="bg-black/20 rounded-lg p-4 text-sm text-slate-300 min-h-[150px] font-sans leading-relaxed whitespace-pre-wrap">
                                                        {original?.response_text || 'Original response text not captured.'}
                                                    </div>
                                                </div>

                                                {/* Replay Output */}
                                                <div className="p-5 bg-purple-500/5">
                                                    <p className="text-[10px] text-purple-400 uppercase font-black mb-3 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                                                        Time Machine Response (New)
                                                    </p>
                                                    <div className="bg-black/40 rounded-lg p-4 text-sm text-white min-h-[150px] font-sans leading-relaxed border border-purple-500/20 whitespace-pre-wrap shadow-inner">
                                                        {res.response_data?.choices?.[0]?.message?.content ||
                                                            res.response_data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                                                            JSON.stringify(res.response_data, null, 2)}
                                                    </div>

                                                    {res.success && (
                                                        <div className="mt-4 flex gap-4 text-[11px]">
                                                            <div className="text-slate-400">Latency: <span className="text-white font-mono">{Math.round(res.latency_ms)}ms</span></div>
                                                            <div className="text-slate-400">Tokens: <span className="text-white font-mono">Captured</span></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Semantic Judge Placeholder */}
                                            <div className="p-3 bg-black/40 border-t border-white/5 flex justify-between items-center italic">
                                                <span className="text-[11px] text-slate-500">LLM-as-a-Judge analysis coming in Phase 3...</span>
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="ghost" className="text-xs h-7">Diff Highlight</Button>
                                                    <Button size="sm" variant="ghost" className="text-xs h-7">Accept Change</Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
