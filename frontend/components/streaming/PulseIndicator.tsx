'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { apiCallsAPI } from '@/lib/api';
import { clsx } from 'clsx';

const POLL_MS = 2500;

interface PulseIndicatorProps {
  projectId: number;
  show5m?: boolean;
  className?: string;
}

export default function PulseIndicator({ projectId, show5m = false, className }: PulseIndicatorProps) {
  const [last1m, setLast1m] = useState<number>(0);
  const [last5m, setLast5m] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!projectId) return;
    const fetchStats = async () => {
      try {
        const data = await apiCallsAPI.streamRecent(projectId, 1);
        setLast1m(data?.last_1m_count ?? 0);
        setLast5m(data?.last_5m_count ?? 0);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, POLL_MS);
    return () => clearInterval(interval);
  }, [projectId]);

  if (loading) {
    return (
      <div
        className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-sm',
          className
        )}
      >
        <Activity className="h-4 w-4 animate-pulse" />
        <span>—</span>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm',
          className
        )}
      >
        <Activity className="h-4 w-4" />
        <span>Offline</span>
      </div>
    );
  }
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-sm',
        last1m > 0 && 'border-emerald-500/30 bg-emerald-500/5',
        className
      )}
    >
      <Activity className={clsx('h-4 w-4', last1m > 0 && 'text-emerald-400 animate-pulse')} />
      <span>
        {show5m ? (
          <>
            <span className="font-medium">{last1m}</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-slate-400">{last5m}</span>
            <span className="text-slate-500 ml-1">(1m / 5m)</span>
          </>
        ) : (
          <span className="font-medium">{last1m}</span>
        )}
      </span>
      <span className="text-slate-500 text-xs">traffic</span>
    </div>
  );
}
