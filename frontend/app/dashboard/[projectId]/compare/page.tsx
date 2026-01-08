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

export default function ComparePage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [comparisons, setComparisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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
    try {
      const days = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
      const data = await benchmarkAPI.compareModels(projectId, days);
      setComparisons(data);
    } catch (error: any) {
      console.error('Failed to load comparisons:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load comparisons', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Model Comparison</h1>
            <p className="text-gray-600 mt-1">Compare performance across different models</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push(`/dashboard/${projectId}`)}
          >
            Back to Project
          </Button>
        </div>

        {/* Date Range Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Date Range:</label>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {/* Comparison Results */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
          </div>
        ) : comparisons.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Comparisons Available</h3>
            <p className="text-sm text-gray-600">
              No model comparison data found for the selected date range.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {comparisons.map((comparison, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {comparison.model}
                    </h3>
                    <p className="text-sm text-gray-600">{comparison.provider}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {comparison.recommendation_score.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500">Score</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="text-xs text-gray-500">Avg Cost</div>
                      <div className="font-medium text-gray-900">
                        ${comparison.avg_cost_per_call.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-xs text-gray-500">Avg Latency</div>
                      <div className="font-medium text-gray-900">
                        {comparison.avg_latency.toFixed(0)}ms
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    <div>
                      <div className="text-xs text-gray-500">Success Rate</div>
                      <div className="font-medium text-gray-900">
                        {(comparison.success_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-orange-600" />
                    <div>
                      <div className="text-xs text-gray-500">Total Calls</div>
                      <div className="font-medium text-gray-900">
                        {comparison.total_calls}
                      </div>
                    </div>
                  </div>
                </div>

                {comparison.recommendation && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="text-sm font-medium text-blue-900 mb-1">Recommendation</div>
                    <div className="text-sm text-blue-700">{comparison.recommendation}</div>
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
