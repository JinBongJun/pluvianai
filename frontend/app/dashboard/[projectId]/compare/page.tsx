'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { benchmarkAPI, apiCallsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { TrendingUp, TrendingDown, DollarSign, Clock, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';

export default function ComparePage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [comparisons, setComparisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ type: 'subscription' | 'empty' | 'api' | null; message: string }>({ type: null, message: '' });
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return date;
    })(),
    to: new Date(),
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    if (dateRange.from && dateRange.to) {
      loadComparisons();
    }
  }, [projectId, dateRange, router]);

  const loadComparisons = async () => {
    if (!dateRange.from || !dateRange.to) return;

    setLoading(true);
    setError({ type: null, message: '' });
    try {
      const days = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
      const data = await benchmarkAPI.compareModels(projectId, days);
      setComparisons(data);
      if (data.length === 0) {
        setError({ type: 'empty', message: 'No comparison data available for the selected date range.' });
      }
    } catch (error: any) {
      console.error('Failed to load comparisons:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to load comparisons';
      
      if (error.response?.status === 403) {
        setError({ 
          type: 'subscription', 
          message: errorMessage 
        });
        toast.showToast('Subscription upgrade required for model comparison', 'warning');
      } else if (error.response?.status === 404 || error.response?.status === 400) {
        setError({ 
          type: 'empty', 
          message: 'No comparison data found. Make sure you have API calls from multiple models in the selected date range.' 
        });
      } else {
        setError({ 
          type: 'api', 
          message: errorMessage 
        });
        toast.showToast(errorMessage, 'error');
      }
      setComparisons([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">Model Comparison</h1>
          <p className="text-slate-400 mt-2">Compare performance across different models</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Date Range Selector */}
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-white">Date Range:</label>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {/* Comparison Results */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 border-t-transparent"></div>
          </div>
        ) : error.type === 'subscription' ? (
          <div className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-b from-orange-500/10 to-orange-500/5 backdrop-blur-sm p-12 text-center shadow-2xl">
            <BarChart3 className="h-12 w-12 text-orange-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Subscription Upgrade Required</h3>
            <p className="text-sm text-slate-300 mb-4">
              {error.message}
            </p>
            <p className="text-sm text-slate-400 mb-6">
              Multi-model comparison is available on Startup plan or higher.
            </p>
            <Button onClick={() => router.push('/settings/billing')}>
              Upgrade Subscription
            </Button>
          </div>
        ) : error.type === 'empty' || comparisons.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-12 text-center shadow-2xl">
            <BarChart3 className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Comparisons Available</h3>
            <p className="text-sm text-slate-400 mb-4">
              {error.message || 'No model comparison data found for the selected date range.'}
            </p>
            <div className="mt-6 space-y-2 text-left max-w-md mx-auto">
              <p className="text-sm text-slate-300 font-medium">To generate comparison data:</p>
              <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
                <li>Make API calls using multiple different models</li>
                <li>Ensure calls are made within the selected date range</li>
                <li>Wait a few minutes for data to be processed</li>
              </ul>
            </div>
            <div className="mt-6">
              <Button 
                variant="outline" 
                onClick={() => router.push(`/dashboard/${projectId}/api-calls`)}
              >
                View API Calls
              </Button>
            </div>
          </div>
        ) : error.type === 'api' ? (
          <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-b from-red-500/10 to-red-500/5 backdrop-blur-sm p-12 text-center shadow-2xl">
            <BarChart3 className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Failed to Load Comparisons</h3>
            <p className="text-sm text-slate-300 mb-4">
              {error.message}
            </p>
            <Button onClick={loadComparisons}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {comparisons.map((comparison, index) => (
              <div
                key={index}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {comparison.model}
                    </h3>
                    <p className="text-sm text-slate-400">{comparison.provider}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {comparison.recommendation_score.toFixed(1)}
                    </div>
                    <div className="text-xs text-slate-400">Score</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-400" />
                    <div>
                      <div className="text-xs text-slate-400">Avg Cost</div>
                      <div className="font-medium text-white">
                        ${comparison.avg_cost_per_call.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-cyan-400" />
                    <div>
                      <div className="text-xs text-slate-400">Avg Latency</div>
                      <div className="font-medium text-white">
                        {comparison.avg_latency.toFixed(0)}ms
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-400" />
                    <div>
                      <div className="text-xs text-slate-400">Success Rate</div>
                      <div className="font-medium text-white">
                        {(comparison.success_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-orange-400" />
                    <div>
                      <div className="text-xs text-slate-400">Total Calls</div>
                      <div className="font-medium text-white">
                        {comparison.total_calls}
                      </div>
                    </div>
                  </div>
                </div>

                {comparison.recommendation && (
                  <div className="mt-4 p-3 bg-purple-500/20 border border-purple-500/30 rounded-md">
                    <div className="text-sm font-medium text-purple-300 mb-1">Recommendation</div>
                    <div className="text-sm text-slate-300">{comparison.recommendation}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
