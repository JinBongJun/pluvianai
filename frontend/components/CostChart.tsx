'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { costAPI } from '@/lib/api';

interface CostData {
  total_cost: number;
  by_model: Record<string, number>;
  by_provider: Record<string, number>;
  by_day: Array<{ date: string; cost: number }>;
  average_daily_cost: number;
}

const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function CostChart({ projectId, days = 7 }: { projectId: number; days?: number }) {
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'daily' | 'model' | 'provider'>('daily');

  useEffect(() => {
    loadData();
  }, [projectId, days]);

  const loadData = async () => {
    try {
      const data = await costAPI.getAnalysis(projectId, days);
      setCostData(data);
    } catch (error) {
      console.error('Failed to load cost data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!costData || costData.total_cost === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        No cost data available
      </div>
    );
  }

  // Prepare daily chart data
  const dailyChartData = costData.by_day.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: parseFloat(item.cost.toFixed(2)),
  }));

  // Prepare model chart data
  const modelChartData = Object.entries(costData.by_model)
    .map(([model, cost]) => ({
      name: model,
      value: parseFloat(cost.toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Top 5 models

  // Prepare provider chart data
  const providerChartData = Object.entries(costData.by_provider)
    .map(([provider, cost]) => ({
      name: provider.charAt(0).toUpperCase() + provider.slice(1),
      value: parseFloat(cost.toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      {/* Chart Type Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setChartType('daily')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            chartType === 'daily'
              ? 'bg-purple-600 text-white'
              : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          Daily
        </button>
        <button
          onClick={() => setChartType('model')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            chartType === 'model'
              ? 'bg-purple-600 text-white'
              : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          By Model
        </button>
        <button
          onClick={() => setChartType('provider')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            chartType === 'provider'
              ? 'bg-purple-600 text-white'
              : 'bg-white/5 text-slate-400 hover:bg-white/10'
          }`}
        >
          By Provider
        </button>
      </div>

      {/* Daily Cost Chart */}
      {chartType === 'daily' && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dailyChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#313035" />
            <XAxis 
              dataKey="date" 
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0B0C15', 
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
            />
            <Legend 
              wrapperStyle={{ color: '#9ca3af' }}
            />
            <Line 
              type="monotone" 
              dataKey="cost" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', r: 4 }}
              activeDot={{ r: 6 }}
              name="Daily Cost"
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Model Cost Chart */}
      {chartType === 'model' && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={modelChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#313035" />
            <XAxis 
              dataKey="name" 
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0B0C15', 
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
            />
            <Legend 
              wrapperStyle={{ color: '#9ca3af' }}
            />
            <Bar dataKey="value" fill="#8b5cf6" name="Cost" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Provider Cost Chart */}
      {chartType === 'provider' && (
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={providerChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {providerChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0B0C15', 
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value: number) => `$${value.toFixed(2)}`}
              />
              <Legend 
                wrapperStyle={{ color: '#9ca3af' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
        <div>
          <p className="text-sm text-slate-400">Total Cost</p>
          <p className="text-2xl font-bold text-white">${costData.total_cost.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400">Avg Daily Cost</p>
          <p className="text-2xl font-bold text-white">${costData.average_daily_cost.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
