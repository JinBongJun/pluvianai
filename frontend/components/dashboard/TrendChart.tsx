'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { dashboardAPI } from '@/lib/api';

interface TrendData {
  time: string;
  avg_score: number | null;
  count: number;
}

interface TrendAnalysis {
  period: string;
  group_by: string;
  period_start: string;
  period_end: string;
  quality_trends: TrendData[];
  model_comparison: Array<{
    model: string;
    provider: string;
    model_name: string;
    total_calls: number;
    successful_calls: number;
    success_rate: number;
    avg_latency_ms: number | null;
  }>;
  agent_comparison: Array<{
    agent_name: string;
    total_calls: number;
    successful_calls: number;
    success_rate: number;
    avg_latency_ms: number | null;
  }>;
}

interface TrendChartProps {
  projectId: number;
  period?: '1d' | '7d' | '30d' | '90d';
  groupBy?: 'hour' | 'day' | 'week';
}

export default function TrendChart({ projectId, period = '7d', groupBy = 'hour' }: TrendChartProps) {
  const [trends, setTrends] = useState<TrendAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'1d' | '7d' | '30d' | '90d'>(period);
  const [selectedGroupBy, setSelectedGroupBy] = useState<'hour' | 'day' | 'week'>(groupBy);

  useEffect(() => {
    const loadTrends = async () => {
      try {
        setLoading(true);
        const data = await dashboardAPI.getTrends(projectId, selectedPeriod, selectedGroupBy);
        setTrends(data);
        setError(null);
      } catch (err: any) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load trends:', err);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(err as Error, { extra: { projectId } });
          });
        }
        setError(err.message || 'Failed to load trends');
      } finally {
        setLoading(false);
      }
    };

    loadTrends();
  }, [projectId, selectedPeriod, selectedGroupBy]);

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <div className="text-red-400">Error loading trends: {error}</div>
      </div>
    );
  }

  if (!trends || trends.quality_trends.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <div className="h-64 flex items-center justify-center text-slate-400">
          No trend data available
        </div>
      </div>
    );
  }

  // Format data for chart
  const chartData = trends.quality_trends.map((item) => {
    const date = new Date(item.time);
    let label = '';
    
    if (selectedGroupBy === 'hour') {
      label = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (selectedGroupBy === 'day') {
      label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return {
      time: label,
      score: item.avg_score,
      count: item.count,
      fullTime: item.time,
    };
  });

  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Quality Score Trends</h3>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as '1d' | '7d' | '30d' | '90d')}
            className="bg-slate-700/50 border border-slate-600 rounded px-3 py-1 text-sm text-white"
          >
            <option value="1d">1 Day</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
          </select>
          {/* Group by selector */}
          <select
            value={selectedGroupBy}
            onChange={(e) => setSelectedGroupBy(e.target.value as 'hour' | 'day' | 'week')}
            className="bg-slate-700/50 border border-slate-600 rounded px-3 py-1 text-sm text-white"
          >
            <option value="hour">By Hour</option>
            <option value="day">By Day</option>
            <option value="week">By Week</option>
          </select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="time" 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
          />
          <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
            domain={[0, 100]}
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
          <Line
            type="monotone"
            dataKey="score"
            stroke="#8B5CF6"
            strokeWidth={2}
            dot={{ fill: '#8B5CF6', r: 3 }}
            name="Quality Score"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Model and Agent Comparison */}
      {(trends.model_comparison.length > 0 || trends.agent_comparison.length > 0) && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {trends.model_comparison.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2">Model Performance</h4>
              <div className="space-y-2">
                {trends.model_comparison.slice(0, 5).map((model) => (
                  <div key={model.model} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{model.model_name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">{model.total_calls} calls</span>
                      <span className={`${
                        model.success_rate >= 95 ? 'text-green-400' :
                        model.success_rate >= 90 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {model.success_rate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trends.agent_comparison.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2">Agent Performance</h4>
              <div className="space-y-2">
                {trends.agent_comparison.slice(0, 5).map((agent) => (
                  <div key={agent.agent_name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{agent.agent_name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400">{agent.total_calls} calls</span>
                      <span className={`${
                        agent.success_rate >= 95 ? 'text-green-400' :
                        agent.success_rate >= 90 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {agent.success_rate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
