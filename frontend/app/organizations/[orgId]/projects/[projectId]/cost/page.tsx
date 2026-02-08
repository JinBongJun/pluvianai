'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import CostChart from '@/components/CostChart';
import { Button } from '@/components/ui/Button';
import { apiCallsAPI } from '@/lib/api';
import { ArrowLeft, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface CostData {
  total_cost: number;
  daily_average: number;
  change_percent: number;
  by_model: { model: string; cost: number }[];
}

export default function CostPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);
  
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  
  const loadData = useCallback(async () => {
    try {
      // Use stats API to get cost data
      const stats = await apiCallsAPI.getStats(projectId, Math.min(days, 30));
      // Calculate cost data from stats (assuming stats has cost info)
      setData({
        total_cost: stats?.total_cost || 0,
        daily_average: stats?.total_cost ? stats.total_cost / days : 0,
        change_percent: 0,
        by_model: [],
      });
    } catch (error) {
      console.error('Failed to load cost data:', error);
      // Set default data on error
      setData({ total_cost: 0, daily_average: 0, change_percent: 0, by_model: [] });
    } finally {
      setLoading(false);
    }
  }, [projectId, days]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadData();
  }, [router, loadData]);

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Cost' },
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
              <h1 className="text-2xl font-bold text-white mb-2">Cost Analysis</h1>
              <p className="text-slate-400">Track and optimize your LLM API spending</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  <p className="text-sm text-slate-400">Total Cost ({days}d)</p>
                </div>
                <span className="text-3xl font-bold text-white">
                  ${loading ? '-' : data?.total_cost?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400 mb-1">Daily Average</p>
                <span className="text-3xl font-bold text-white">
                  ${loading ? '-' : data?.daily_average?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400 mb-1">vs Previous Period</p>
                <div className="flex items-center gap-2">
                  {data?.change_percent !== undefined && data.change_percent > 0 ? (
                    <TrendingUp className="h-5 w-5 text-red-400" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-green-400" />
                  )}
                  <span className="text-3xl font-bold text-white">
                    {loading ? '-' : data?.change_percent ? `${data.change_percent > 0 ? '+' : ''}${data.change_percent.toFixed(1)}%` : '0%'}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Chart */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Daily Cost Breakdown</h2>
              <div className="h-[400px]">
                <CostChart projectId={projectId} days={days} />
              </div>
            </div>

            {/* Cost by Model */}
            {data?.by_model && data.by_model.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Cost by Model</h2>
                <div className="space-y-3">
                  {data.by_model.map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <span className="text-sm text-slate-300">{item.model}</span>
                      <span className="text-sm font-medium text-white">${item.cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Cost Optimization Tips</h2>
              <div className="text-sm text-slate-400 space-y-2">
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Use caching for repeated queries to reduce API calls</li>
                  <li>Consider using smaller models for simple tasks</li>
                  <li>Implement token limits to prevent runaway costs</li>
                  <li>Set up cost alerts to monitor spending</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
    </ProjectLayout>
  );
}
