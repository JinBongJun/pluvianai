'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Database, FileArchive, Trash2 } from 'lucide-react';
import { behaviorAPI } from '@/lib/api';

interface ClinicalLogDataSectionProps {
    projectId: number;
    agentId: string;
}

interface DatasetItem {
    id: string;
    project_id: number;
    agent_id?: string | null;
    trace_ids?: string[] | null;
    snapshot_ids?: number[] | null;
    label?: string | null;
    tag?: string | null;
    created_at?: string | null;
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export const ClinicalLogDataSection: React.FC<ClinicalLogDataSectionProps> = ({ projectId, agentId }) => {
    const { data, error, isLoading, mutate } = useSWR(
        projectId && agentId ? ['behavior-datasets', projectId, agentId] : null,
        () => behaviorAPI.listDatasets(projectId, { agent_id: agentId, limit: 50, offset: 0 })
    );
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ datasetId: string; label: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const items = (data?.items ?? []) as DatasetItem[];
    const total = data?.total ?? 0;

    const openConfirm = (datasetId: string, label: string) => {
        setDeleteError(null);
        setConfirmDelete({ datasetId, label });
    };

    const closeConfirm = () => {
        setConfirmDelete(null);
        setDeleteError(null);
    };

    const handleConfirmDelete = async () => {
        if (!projectId || !confirmDelete) return;
        const { datasetId, label } = confirmDelete;
        setDeletingId(datasetId);
        setDeleteError(null);
        try {
            await behaviorAPI.deleteDataset(projectId, datasetId);
            closeConfirm();
            await mutate();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to delete dataset';
            setDeleteError(typeof msg === 'string' ? msg : 'Failed to delete dataset');
        } finally {
            setDeletingId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="p-10 flex flex-col items-center justify-center gap-4 opacity-60">
                <div className="animate-pulse p-4 rounded-full bg-white/5">
                    <Database className="w-8 h-8 text-emerald-500" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Loading datasets...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-10 flex flex-col items-center justify-center gap-4">
                <p className="text-sm text-rose-400 font-medium">Failed to load datasets. Please retry.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full relative">
            {confirmDelete && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0f1e] shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/5">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">Delete dataset</h3>
                            <p className="mt-2 text-sm text-slate-400">
                                Delete &quot;{confirmDelete.label}&quot;? This cannot be undone.
                            </p>
                            {deleteError && (
                                <p className="mt-3 text-xs text-rose-400 font-medium">{deleteError}</p>
                            )}
                        </div>
                        <div className="p-4 flex items-center justify-end gap-3 bg-white/[0.02]">
                            <button
                                type="button"
                                onClick={closeConfirm}
                                disabled={!!deletingId}
                                className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={!!deletingId}
                                className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {deletingId ? (
                                    <>
                                        <span className="inline-block w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                        Deleting…
                                    </>
                                ) : (
                                    'Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="p-8 pb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <Database className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-black text-slate-300 uppercase tracking-[0.18em]">Saved datasets</span>
                </div>
                <span className="text-xs font-mono text-emerald-400/80 font-black">
                    {total} dataset{total !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-20 space-y-3">
                {items.length === 0 && (
                    <div className="p-10 text-center space-y-4 border border-dashed border-white/5 rounded-3xl">
                        <FileArchive className="w-8 h-8 text-slate-700 mx-auto" />
                        <p className="text-xs font-black text-slate-500 uppercase tracking-wide leading-relaxed">
                            No datasets saved yet. Select snapshots in Clinical Log and use Save data.
                        </p>
                    </div>
                )}

                {items.map((ds) => {
                    const snapshotCount = Array.isArray(ds.snapshot_ids) ? ds.snapshot_ids.length : 0;
                    const label = ds.label?.trim() || `Dataset ${ds.id.slice(0, 8)}`;
                    const isDeleting = deletingId === ds.id;
                    return (
                        <div
                            key={ds.id}
                            className={clsx(
                                "group rounded-[24px] border transition-all duration-500 overflow-hidden",
                                "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.03]"
                            )}
                        >
                            <div className="p-5 flex items-center justify-between">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 shrink-0">
                                        <Database className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <span className="text-sm font-black text-white truncate block">{label}</span>
                                        <p className="text-[11px] text-slate-500 font-mono">
                                            {snapshotCount} snapshot{snapshotCount !== 1 ? 's' : ''} · {formatDate(ds.created_at)}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openConfirm(ds.id, label)}
                                    disabled={isDeleting}
                                    className={clsx(
                                        "shrink-0 p-2 rounded-lg border transition-colors",
                                        "border-transparent text-slate-500 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10",
                                        "disabled:opacity-50 disabled:pointer-events-none"
                                    )}
                                    title="Delete dataset"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
