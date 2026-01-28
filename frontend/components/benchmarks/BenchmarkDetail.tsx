'use client';

import { useEffect, useState } from 'react';
import { publicBenchmarksAPI } from '@/lib/api';
import { Eye, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Benchmark {
  id: number;
  author_id: number | null;
  name: string;
  description: string | null;
  benchmark_type: string;
  benchmark_data: any;
  test_cases_count: number;
  category: string | null;
  tags: string[];
  is_featured: boolean;
  is_approved: boolean;
  view_count: number;
  created_at: string;
}

interface BenchmarkDetailProps {
  benchmarkId: number;
}

export default function BenchmarkDetail({ benchmarkId }: BenchmarkDetailProps) {
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBenchmark();
  }, [benchmarkId]);

  const loadBenchmark = async () => {
    try {
      setLoading(true);
      const data = await publicBenchmarksAPI.get(benchmarkId);
      setBenchmark(data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load benchmark:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { benchmarkId } });
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatChartData = (data: any) => {
    if (!data || typeof data !== 'object') return [];

    if (Array.isArray(data)) {
      return data.map((item, idx) => ({
        name: item.model || item.name || `Model ${idx + 1}`,
        score: item.score || item.quality_score || 0,
        latency: item.latency || item.avg_latency || 0,
        cost: item.cost || 0,
      }));
    }

    // Object format: { "model_name": { score: 85, latency: 120, ... } }
    return Object.entries(data).map(([name, value]: [string, any]) => ({
      name,
      score: value.score || value.quality_score || value.avg_score || 0,
      latency: value.latency || value.avg_latency || 0,
      cost: value.cost || value.total_cost || 0,
    }));
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/2"></div>
          <div className="h-4 bg-slate-700 rounded w-full"></div>
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!benchmark) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <p className="text-slate-400">Benchmark not found</p>
      </div>
    );
  }

  const chartData = formatChartData(benchmark.benchmark_data);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        {benchmark.is_featured && (
          <span className="inline-block px-2 py-1 text-xs bg-ag-primary text-ag-accent-light rounded mb-4">
            Featured
          </span>
        )}
        <h1 className="text-2xl font-bold text-white mb-2">{benchmark.name}</h1>
        {benchmark.description && (
          <p className="text-slate-400 mb-4">{benchmark.description}</p>
        )}

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <span className="text-sm text-slate-400">Type</span>
            <p className="text-white font-medium capitalize">{benchmark.benchmark_type.replace('_', ' ')}</p>
          </div>
          {benchmark.category && (
            <div>
              <span className="text-sm text-slate-400">Category</span>
              <p className="text-white font-medium capitalize">{benchmark.category}</p>
            </div>
          )}
          <div>
            <span className="text-sm text-slate-400">Test Cases</span>
            <p className="text-white font-medium">{benchmark.test_cases_count}</p>
          </div>
          <div>
            <span className="text-sm text-slate-400">Views</span>
            <p className="text-white font-medium flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {benchmark.view_count}
            </p>
          </div>
        </div>

        {/* Tags */}
        {benchmark.tags && benchmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {benchmark.tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-block px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Performance Comparison</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="name" 
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF' }}
              />
              <YAxis 
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                }}
                labelStyle={{ color: '#E2E8F0' }}
              />
              <Legend />
              <Bar dataKey="score" fill="#8B5CF6" name="Quality Score" />
              {chartData.some((d) => d.latency > 0) && (
                <Bar dataKey="latency" fill="#10B981" name="Latency (ms)" />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Raw Data */}
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <h2 className="text-lg font-semibold text-white mb-4">Benchmark Data</h2>
        <pre className="bg-slate-900 p-4 rounded border border-slate-700 overflow-x-auto">
          <code className="text-sm text-slate-300">
            {JSON.stringify(benchmark.benchmark_data, null, 2)}
          </code>
        </pre>
      </div>
    </div>
  );
}
