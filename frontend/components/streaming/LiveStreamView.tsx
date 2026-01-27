'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiCallsAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import Badge from '@/components/ui/Badge';
import { clsx } from 'clsx';

const MAX_ITEMS = 25;

interface LiveStreamViewProps {
  projectId: number;
  /** Max rows to show */
  limit?: number;
  /** Link to full API calls page */
  linkToCalls?: boolean;
  className?: string;
}

export default function LiveStreamView({
  projectId,
  limit = MAX_ITEMS,
  linkToCalls = true,
  className,
}: LiveStreamViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [last1m, setLast1m] = useState(0);
  const [last5m, setLast5m] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!projectId) return;

    // Use Server-Sent Events for real-time streaming
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('access_token');
    
    const eventSource = new EventSource(
      `${API_URL}/api/v1/api-calls/stream/live?project_id=${projectId}`,
      {
        withCredentials: false,
        // Note: EventSource doesn't support custom headers, so we'll use query param or cookie
      }
    );

    eventSourceRef.current = eventSource;
    let pollingInterval: NodeJS.Timeout | null = null;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const list = Array.isArray(data?.items) ? data.items : [];
        setLast1m(data?.last_1m_count ?? 0);
        setLast5m(data?.last_5m_count ?? 0);
        setItems(list.slice(0, limit));
        setError(false);
        setLoading(false);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to parse SSE data:', err);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(err as Error, { extra: { projectId } });
          });
        }
        setError(true);
        setLoading(false);
      }
    };

    eventSource.onerror = (err) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('SSE connection error:', err);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(err as unknown as Error, { extra: { projectId } });
        });
      }
      setError(true);
      setLoading(false);
      // Fallback to polling if SSE fails
      eventSource.close();
      
      // Fallback polling
      const fetchStream = async () => {
        try {
          const data = await apiCallsAPI.streamRecent(projectId, limit);
          const list = Array.isArray(data?.items) ? data.items : [];
          setLast1m(data?.last_1m_count ?? 0);
          setLast5m(data?.last_5m_count ?? 0);
          setItems(list);
          setError(false);
        } catch {
          setError(true);
        }
      };
      
      fetchStream();
      pollingInterval = setInterval(fetchStream, 2500);
    };

    return () => {
      eventSource.close();
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [projectId, limit]);

  const getStatusBadge = (statusCode: number | null) => {
    if (!statusCode) return <Badge variant="default">—</Badge>;
    if (statusCode >= 200 && statusCode < 300) return <Badge variant="success">OK</Badge>;
    if (statusCode >= 400 && statusCode < 500) return <Badge variant="warning">4xx</Badge>;
    return <Badge variant="error">5xx</Badge>;
  };

  if (loading && items.length === 0) {
    return (
      <div
        className={clsx(
          'rounded-xl border border-white/10 bg-white/5 p-6 flex items-center justify-center min-h-[200px]',
          className
        )}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={clsx(
          'rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-red-400 min-h-[120px] flex items-center justify-center',
          className
        )}
      >
        Failed to load live stream. Check connection.
      </div>
    );
  }

  return (
    <div className={clsx('rounded-xl border border-white/10 bg-white/5 overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/10 flex-wrap">
        <h3 className="text-sm font-medium text-slate-300">Live stream</h3>
        <span className="text-xs text-slate-500">
          {last1m} calls in last 1m{last5m > 0 && ` · ${last5m} in 5m`} · live
        </span>
        {linkToCalls && (
          <button
            type="button"
            onClick={() => router.push(`/dashboard/${projectId}/api-calls`)}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors ml-auto"
          >
            View all →
          </button>
        )}
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No recent API calls</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {items.map((call) => (
              <li
                key={call.id}
                className={clsx(
                  'px-4 py-2.5 flex items-center gap-4 text-sm transition-all duration-300',
                  'hover:bg-white/5 animate-fade-in'
                )}
              >
                <span className="text-slate-500 shrink-0 w-32">
                  {call.created_at ? new Date(call.created_at).toLocaleTimeString() : '—'}
                </span>
                <span className="text-white font-medium shrink-0 w-24 truncate">
                  {call.provider || '—'}
                </span>
                <span className="text-slate-400 shrink-0 w-28 truncate">{call.model || '—'}</span>
                <span className="shrink-0">{getStatusBadge(call.status_code)}</span>
                <span className="text-slate-400 shrink-0">
                  {call.latency_ms != null ? `${toFixedSafe(call.latency_ms, 0)}ms` : '—'}
                </span>
                {call.agent_name && (
                  <span className="text-slate-500 truncate shrink">{call.agent_name}</span>
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/${projectId}/api-calls/${call.id}`)}
                  className="ml-auto text-purple-400 hover:text-purple-300 text-xs shrink-0"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
