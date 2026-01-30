'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import QualityChart from '@/components/QualityChart';
import Button from '@/components/ui/Button';
import { qualityAPI } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface QualityData {
  average_score: number;
  total_evaluations: number;
  trend: 'up' | 'down' | 'stable';
  change_percent: number;
}

export default function QualityPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);
  
  const [days, setDays] = useState<7 | 30 | 90>(30);

  // Auth check
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  // Use custom hook for data fetching - replaces manual useState + useEffect pattern
  const fetcher = useCallback(
    () => qualityAPI.getStats(projectId, days),
    [projectId, days]
  );
  
  const { data, loading, error, refetch } = useAsyncData<QualityData>(
    fetcher,
    { 
      deps: [projectId, days],
      keepPreviousData: true,
    }
  );

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-5 w-5 text-green-400" />;
      case 'down':
        return <TrendingDown className="h-5 w-5 text-red-400" />;
      default:
        return <Minus className="h-5 w-5 text-slate-400" />;
    }
  };

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Quality' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        <ProjectTabs projectId={projectId} orgId={orgId} />
          
          <div className="mt-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(basePath)}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to Overview
                </Button>
              </div>
              <div className="flex gap-2">
                {([7, 30, 90] as const).map((d) => (
                  <Button
                    key={d}
                    variant={days === d ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setDays(d)}
                  >
                    {d} Days
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Quality Score Analysis</h1>
              <p className="text-slate-400">Monitor and analyze the quality of your AI responses over time</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400 mb-1">Average Score</p>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-white">
                    {loading ? '-' : data?.average_score?.toFixed(1) || '-'}
                  </span>
                  <span className="text-slate-400">/10</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400 mb-1">Total Evaluations</p>
                <span className="text-3xl font-bold text-white">
                  {loading ? '-' : data?.total_evaluations?.toLocaleString() || '0'}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400 mb-1">Trend</p>
                <div className="flex items-center gap-2">
                  {data && getTrendIcon(data.trend)}
                  <span className="text-3xl font-bold text-white">
                    {loading ? '-' : data?.change_percent ? `${data.change_percent > 0 ? '+' : ''}${data.change_percent.toFixed(1)}%` : '0%'}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Chart */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Quality Score Over Time</h2>
              <div className="h-[400px]">
                <QualityChart projectId={projectId} />
              </div>
            </div>

            {/* Info */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">About Quality Scoring</h2>
              <div className="text-sm text-slate-400 space-y-2">
                <p>Quality scores are calculated based on multiple factors:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Response relevance and accuracy</li>
                  <li>Latency and response time</li>
                  <li>Token efficiency</li>
                  <li>Error rates and failures</li>
                </ul>
                <p className="mt-4">
                  Higher scores indicate better overall performance. Aim for scores above 7.0 for production workloads.
                </p>
              </div>
            </div>
          </div>
        </div>
    </ProjectLayout>
  );
}
