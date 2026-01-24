'use client';

import { useState, useEffect } from 'react';
import { replayAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';
import { AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';

interface PanicToggleProps {
    projectId: number;
}

export default function PanicToggle({ projectId }: PanicToggleProps) {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const toast = useToast();

    useEffect(() => {
        loadPanicStatus();
    }, [projectId]);

    const loadPanicStatus = async () => {
        try {
            const data = await replayAPI.getPanicMode(projectId);
            setEnabled(data.enabled);
        } catch (err) {
            console.error('Failed to load panic status:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async () => {
        setToggling(true);
        const newState = !enabled;
        try {
            await replayAPI.togglePanicMode(projectId, newState);
            setEnabled(newState);
            toast.showToast(
                newState ? 'Panic Mode ENABLED. All AI traffic blocked.' : 'Panic Mode DISABLED. Traffic resumed.',
                newState ? 'warning' : 'success'
            );
        } catch (err: any) {
            toast.showToast(err.response?.data?.detail || 'Failed to toggle panic mode', 'error');
        } finally {
            setToggling(false);
        }
    };

    if (loading) return <div className="h-20 animate-pulse bg-white/5 rounded-lg"></div>;

    return (
        <div className={clsx(
            "relative overflow-hidden rounded-xl border p-5 transition-all duration-300",
            enabled
                ? "border-red-500/50 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                : "border-white/10 bg-white/5"
        )}>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        "p-2 rounded-lg",
                        enabled ? "bg-red-500 text-white animate-pulse" : "bg-slate-700 text-slate-300"
                    )}>
                        {enabled ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                    </div>
                    <div>
                        <h3 className={clsx(
                            "text-lg font-bold",
                            enabled ? "text-red-400" : "text-white"
                        )}>
                            Panic Button (Circuit Breaker)
                        </h3>
                        <p className="text-sm text-slate-400">
                            {enabled
                                ? "Immediate shutdown active. All AI requests return 503."
                                : "System running normally. Toggle to block all traffic."}
                        </p>
                    </div>
                </div>

                <Button
                    variant={enabled ? "secondary" : "danger"}
                    onClick={handleToggle}
                    disabled={toggling}
                    isLoading={toggling}
                    className={clsx(
                        "min-w-[140px] font-bold uppercase tracking-wider",
                        enabled && "hover:bg-slate-200/20 transition-colors"
                    )}
                >
                    {enabled ? "Resume Traffic" : "ACTIVATE PANIC"}
                </Button>
            </div>

            {enabled && (
                <div className="mt-4 flex items-start gap-2 text-xs text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>WARNING: Your users will receive service unavailable errors while this is active.</span>
                </div>
            )}
        </div>
    );
}
