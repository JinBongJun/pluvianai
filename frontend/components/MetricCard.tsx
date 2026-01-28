'use client';

import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  data?: Array<{ date: string; value: number }>;
  status?: 'normal' | 'warning' | 'error';
  sparkline?: boolean;
}

export default function MetricCard({ 
  title, 
  value, 
  change, 
  data = [], 
  status = 'normal',
  sparkline = true 
}: MetricCardProps) {
  const statusColors = {
    normal: {
      glow: 'bg-ag-accent/20',
      chart: '#D1B45F',
      border: 'border-white/10',
    },
    warning: {
      glow: 'bg-orange-500/20',
      chart: '#f97316',
      border: 'border-orange-500/30',
    },
    error: {
      glow: 'bg-red-500/20',
      chart: '#ef4444',
      border: 'border-red-500/30',
    },
  };

  const colors = statusColors[status];
  const cardId = title.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${colors.border} bg-ag-surface p-6 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-gold`}>
      {/* 배경 Glow 효과 */}
      <div className={`pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full ${colors.glow} blur-[60px]`} />
      
      <div className="relative z-10 flex flex-col justify-between h-full">
        <div>
          <h3 className="text-sm font-medium text-ag-muted mb-2">{title}</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-ag-text tracking-tight font-mono">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {change !== undefined && (
              <span className={`text-xs font-medium ${
                change > 0 ? 'text-emerald-400' : change < 0 ? 'text-rose-400' : 'text-ag-muted'
              }`}>
                {change > 0 ? '+' : ''}{change}%
              </span>
            )}
          </div>
        </div>

        {/* Sparkline 차트 */}
        {sparkline && data.length > 0 && (
          <div className="h-16 mt-4 w-full opacity-80 hover:opacity-100 transition-opacity">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`gradient-${cardId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.chart} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={colors.chart} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke={colors.chart} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill={`url(#gradient-${cardId})`}
                  dot={false}
                />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#121712', 
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#E7E7E2'
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
