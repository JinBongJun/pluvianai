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
import posthog from 'posthog-js';
import { clsx } from 'clsx';

export default function ReplayPage() {
    const router = useRouter();
    const params = useParams();
    const toast = useToast();
    const projectId = Number(params.projectId);

    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [replaying, setReplaying] = useState(false);
    const [isConcurrencyBlocked, setIsConcurrencyBlocked] = useState(false);
    const [concurrencyError, setConcurrencyError] = useState<{
        message?: string;
        limit?: number;
        current?: number;
    } | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [results, setResults] = useState<any[]>([]);

    // Overrides
    const [targetModel, setTargetModel] = useState('');
    const [targetPrompt, setTargetPrompt] = useState('');
    const [rubrics, setRubrics] = useState<any[]>([]);
    const [selectedRubricId, setSelectedRubricId] = useState<number | null>(null);
    const [judgeModel, setJudgeModel] = useState('gpt-4o-mini');
    const [showRubricModal, setShowRubricModal] = useState(false);

    // New Rubric Form
    const [newRubricName, setNewRubricName] = useState('');
    const [newRubricPrompt, setNewRubricPrompt] = useState('');

    useEffect(() => {
        loadSnapshots();
        loadRubrics();
    }, [projectId]);

    const loadRubrics = async () => {
        try {
            const data = await replayAPI.listRubrics(projectId);
            setRubrics(data);
        } catch (err) {
            if (process.env.NODE_ENV === 'development') {
              console.error('Failed to load rubrics');
            }
        }
    };

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
        if (isConcurrencyBlocked) return;

        setReplaying(true);
        try {
            const replayResults = await replayAPI.runBatchReplay(projectId, {
                snapshot_ids: selectedIds,
                new_model: targetModel || undefined,
                new_system_prompt: targetPrompt || undefined,
                rubric_id: selectedRubricId || undefined,
                judge_model: judgeModel
            });
            
            // Track replay execution event
            posthog.capture('replay_executed', {
                project_id: projectId,
                item_count: selectedIds.length,
                has_rubric: !!selectedRubricId,
                has_target_model: !!targetModel,
                success_count: replayResults.filter((r: any) => r.success).length,
            });
            
            setResults(replayResults);
            toast.showToast(`Batch replay of ${selectedIds.length} items completed`, 'success');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            const errorCode = typeof detail === 'object' ? detail?.code : undefined;
            if (err?.response?.status === 403 && errorCode === 'CONCURRENT_TEST_NOT_ALLOWED') {
                setIsConcurrencyBlocked(true);
                setConcurrencyError({
                    message:
                        detail?.message ||
                        '동시에 실행할 수 있는 테스트를 초과했습니다. 다른 테스트가 완료된 후 다시 시도해주세요.',
                    limit: detail?.limit,
                    current: detail?.current,
                });
                toast.showToast(
                    detail?.message ||
                        '다른 테스트가 이미 실행 중입니다. 먼저 실행 중인 테스트가 끝난 후 다시 시도해주세요.',
                    'warning',
                );
            } else {
                toast.showToast(detail || 'Replay failed', 'error');
            }
        } finally {
            setReplaying(false);
        }
    };

    const handleCreateRubric = async () => {
        if (!newRubricName || !newRubricPrompt) {
            toast.showToast('Please fill in rubric name and criteria', 'warning');
            return;
        }
        try {
            await replayAPI.createRubric(projectId, {
                name: newRubricName,
                criteria_prompt: newRubricPrompt
            });
            toast.showToast('Rubric created successfully', 'success');
            setShowRubricModal(false);
            setNewRubricName('');
            setNewRubricPrompt('');
            loadRubrics();
        } catch (err) {
            toast.showToast('Failed to create rubric', 'error');
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    return (
        <DashboardLayout>
            <div className="bg-ag-bg min-h-screen text-white">
                {concurrencyError && (
                    <div className="mb-4 rounded-md border border-yellow-500/60 bg-yellow-500/10 px-3 py-2 text-xs flex items-start justify-between gap-3">
                        <div>
                            <div className="font-semibold text-yellow-200">다른 테스트가 실행 중입니다.</div>
                            <div className="text-yellow-100/80">
                                {concurrencyError.message ||
                                    '동시에 실행할 수 있는 테스트 개수를 초과했습니다. 다른 테스트가 끝난 후 다시 시도해주세요.'}
                            </div>
                            {typeof concurrencyError.limit === 'number' && (
                                <div className="mt-1 text-[11px] text-yellow-100/80">
                                    최대 동시 테스트: {concurrencyError.limit}개 (현재 실행 중:{' '}
                                    {concurrencyError.current ?? '알 수 없음'}개)
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className="ml-2 text-yellow-200/80 hover:text-yellow-50 text-xs"
                            onClick={() => setConcurrencyError(null)}
                        >
                            닫기
                        </button>
                    </div>
                )}
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
                        disabled={replaying || selectedIds.length === 0 || isConcurrencyBlocked}
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
                                    <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Automated Judge (Rubric)</label>
                                    <div className="flex gap-2">
                                        <select
                                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-purple-500 transition-colors text-white"
                                            value={selectedRubricId || ''}
                                            onChange={e => setSelectedRubricId(Number(e.target.value) || null)}
                                        >
                                            <option value="">No Automated Judging</option>
                                            {rubrics.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => setShowRubricModal(true)}
                                            className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-white font-bold"
                                            title="Create New Rubric"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1 italic">Select criteria for AI-to-AI scoring.</p>
                                </div>

                                {selectedRubricId && (
                                    <div className="animate-in fade-in slide-in-from-top-2">
                                        <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Evaluator Model (The Judge)</label>
                                        <select
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-purple-500 transition-colors text-white"
                                            value={judgeModel}
                                            onChange={e => setJudgeModel(e.target.value)}
                                        >
                                            <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                                            <option value="gpt-4o">GPT-4o (High Precision)</option>
                                            <option value="o1-preview">o1-preview (Reasoning)</option>
                                        </select>
                                    </div>
                                )}
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

                                            {/* AI Judge Evaluation (Phase 3) */}
                                            {res.evaluation && (
                                                <div className="p-4 bg-purple-900/20 border-t border-purple-500/20 hover:bg-purple-900/30 transition-colors">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="bg-purple-500 rounded p-1">
                                                                <History className="h-3 w-3 text-white" />
                                                            </div>
                                                            <span className="text-xs font-bold text-purple-300">AI JUDGE RESULT</span>
                                                        </div>
                                                        <div className="flex gap-4">
                                                            <div className="text-center">
                                                                <p className="text-[9px] text-slate-500 uppercase">Original</p>
                                                                <p className="text-lg font-black text-slate-400">{res.evaluation.original_score}/5</p>
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-[9px] text-purple-400 uppercase">Replay</p>
                                                                <p className={clsx(
                                                                    "text-lg font-black",
                                                                    res.evaluation.regression_detected ? "text-red-500" : "text-green-400"
                                                                )}>
                                                                    {res.evaluation.replayed_score}/5
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-300 leading-relaxed italic border-l-2 border-purple-500/50 pl-3 py-1">
                                                        &quot;{res.evaluation.reasoning}&quot;
                                                    </p>
                                                    {res.evaluation.regression_detected && (
                                                        <div className="mt-2 flex items-center gap-2 text-[10px] text-red-400 font-bold">
                                                            <Trash2 className="h-3 w-3" />
                                                            REGRESSION DETECTED: New response score is lower.
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {!res.evaluation && (
                                                <div className="p-3 bg-black/40 border-t border-white/5 flex justify-between items-center italic">
                                                    <span className="text-[11px] text-slate-500">Enable a Rubric on the left for automated scoring.</span>
                                                    <div className="flex gap-2">
                                                        <Button size="sm" variant="ghost" className="text-xs h-7">Diff Highlight</Button>
                                                        <Button size="sm" variant="ghost" className="text-xs h-7">Accept Change</Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Rubric Creation Modal */}
            {showRubricModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#0D0F17] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Settings2 className="h-5 w-5 text-purple-500" />
                            Create New Evaluation Rubric
                        </h2>
                        <p className="text-slate-400 text-sm mb-6">Define the criteria your AI Judge will use to score responses.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Rubric Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Technical Accuracy, Politeness"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500"
                                    value={newRubricName}
                                    onChange={e => setNewRubricName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Prompt Criteria (The Judge&apos;s Rulebook)</label>
                                <textarea
                                    rows={5}
                                    placeholder="Instructions for the AI Judge. Example: Evaluate if the response follows the corporate tone. If it's too casual, score 1."
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500"
                                    value={newRubricPrompt}
                                    onChange={e => setNewRubricPrompt(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <Button
                                variant="secondary"
                                onClick={() => setShowRubricModal(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateRubric}
                                className="flex-1"
                            >
                                Save Rubric
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
