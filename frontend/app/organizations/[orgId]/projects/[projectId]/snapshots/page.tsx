'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import { liveViewAPI, projectsAPI, organizationsAPI } from '@/lib/api';

type SnapshotItem = {
  id: number | string;
  created_at?: string;
  request_prompt?: string;
  response_text?: string;
  user_message?: string;
  response?: string;
  latency_ms?: number | null;
  tokens_used?: number | null;
  cost?: number | null;
  is_worst?: boolean;
  status_code?: number | null;
};

export default function SnapshotsPage() {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const { data: project } = useSWR(
    projectId ? ['project', projectId] : null,
    () => projectsAPI.get(projectId),
  );
  const { data: org } = useSWR(
    orgId ? ['organization', orgId] : null,
    () => organizationsAPI.get(orgId, { includeStats: false }),
  );

  // TODO: 백엔드 연동 완료 전까지는 Snapshots 백엔드 호출을 막아서 500 에러를 피한다.
  const SNAPSHOTS_BACKEND_ENABLED = false;

  const { data: snapshotsData } = useSWR(
    SNAPSHOTS_BACKEND_ENABLED && projectId ? ['project-snapshots', projectId] : null,
    () => liveViewAPI.listSnapshots(projectId, { limit: 50 }),
  );

  const snapshots: SnapshotItem[] = useMemo(() => {
    if (!snapshotsData) return [];
    if (Array.isArray(snapshotsData)) return snapshotsData as SnapshotItem[];
    if (Array.isArray((snapshotsData as any).items)) return (snapshotsData as any).items as SnapshotItem[];
    if (Array.isArray((snapshotsData as any).data)) return (snapshotsData as any).data as SnapshotItem[];
    return [];
  }, [snapshotsData]);

  const total = snapshots.length;

  const formatTime = (created?: string) => {
    if (!created) return '';
    try {
      const d = new Date(created);
      return d.toLocaleString();
    } catch {
      return created;
    }
  };

  const getStatusIcon = (s: SnapshotItem) => {
    if (s.is_worst) return '⚠️';
    if (s.status_code && s.status_code >= 400) return '⚠️';
    return '✅';
  };

  const getStatusLabel = (s: SnapshotItem) => {
    if (s.is_worst) return 'Worst';
    if (s.status_code && s.status_code >= 400) return `Error ${s.status_code}`;
    return 'OK';
  };

  const getInText = (s: SnapshotItem) =>
    (s.request_prompt || s.user_message || '').toString();

  const getOutText = (s: SnapshotItem) =>
    (s.response_text || s.response || '').toString();

  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      activeTab="snapshots"
      showCopyButton={false}
    >
      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ag-text">Snapshots</h1>
            <p className="text-[12px] text-ag-muted mt-1">
              {total > 0 ? `📸 ${total} snapshots` : 'No snapshots yet. Calls from this project will appear here.'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ag-muted">
            <span className="text-ag-muted/80">Period</span>
            <select
              className="rounded-md bg-black/40 border border-white/10 px-2 py-1 text-[12px] text-ag-text"
              defaultValue="7d"
              disabled
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto pr-2 space-y-2 mt-2">
          {snapshots.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-ag-text shadow-sm hover:border-ag-accent/60 hover:shadow-[0_0_18px_rgba(0,212,255,0.25)] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span>{getStatusIcon(s)}</span>
                  <span className="text-[11px] text-ag-muted">{getStatusLabel(s)}</span>
                </div>
                {s.created_at && (
                  <span className="text-[11px] text-ag-muted">
                    {formatTime(s.created_at)}
                  </span>
                )}
              </div>
              {getInText(s) && (
                <p className="text-[12px] text-ag-text truncate">
                  <span className="text-ag-muted">In: </span>
                  {getInText(s)}
                </p>
              )}
              {getOutText(s) && (
                <p className="text-[12px] text-ag-text truncate">
                  <span className="text-ag-muted">Out: </span>
                  {getOutText(s)}
                </p>
              )}
              <div className="mt-1 text-[11px] text-ag-muted flex gap-3">
                {s.latency_ms != null && <span>{s.latency_ms}ms</span>}
                {s.tokens_used != null && <span>{s.tokens_used} tokens</span>}
                {s.cost != null && <span>${Number(s.cost).toFixed(4)}</span>}
              </div>
            </div>
          ))}

          {total === 0 && (
            <div className="mt-4 text-[12px] text-ag-muted">
              Once your SDK sends calls to this project, recent snapshots will be listed here for replay and analysis.
            </div>
          )}
        </div>
      </div>
    </CanvasPageLayout>
  );
}

