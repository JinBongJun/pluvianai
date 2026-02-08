'use client';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export default function StatsCard({ title, value, subtitle, icon, trend }: StatsCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ag-surface p-6 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-gold">
      {/* 배경 Glow 효과 */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-ag-accent/20 blur-[60px]" />

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-ag-muted mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-ag-text font-mono">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {trend && (
              <span className={`text-xs font-medium ${trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-ag-muted mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="ml-4 text-ag-muted">{icon}</div>}
      </div>
    </div>
  );
}

