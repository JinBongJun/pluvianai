'use client';

import { useEffect, useState } from 'react';
import { dashboardAPI } from '@/lib/api';
import { AlertCircle, TrendingDown, Zap, DollarSign } from 'lucide-react';

interface ActivityItem {
  id: number;
  type: 'api_call' | 'drift' | 'alert' | 'cost';
  title: string;
  message?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
}

interface ActivityFeedProps {
  projectId: number;
  period?: '24h' | '7d' | '30d';
}

export default function ActivityFeed({ projectId, period = '24h' }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadActivities = async () => {
      try {
        const metrics = await dashboardAPI.getMetrics(projectId, period);
        
        // Convert metrics to activity items
        const items: ActivityItem[] = [];

        // Add recent alerts
        if (metrics.recent_alerts) {
          metrics.recent_alerts.forEach((alert: any) => {
            items.push({
              id: alert.id,
              type: 'alert',
              title: alert.title,
              severity: alert.severity,
              timestamp: alert.created_at,
            });
          });
        }

        // Add drift detections
        if (metrics.drift && metrics.drift.total_detections > 0) {
          items.push({
            id: -1,
            type: 'drift',
            title: `${metrics.drift.total_detections} drift detection${metrics.drift.total_detections > 1 ? 's' : ''}`,
            message: metrics.drift.critical_detections > 0 
              ? `${metrics.drift.critical_detections} critical` 
              : undefined,
            severity: metrics.drift.critical_detections > 0 ? 'critical' : 'high',
            timestamp: new Date().toISOString(),
          });
        }

        // Sort by timestamp (newest first)
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setActivities(items.slice(0, 10)); // Show last 10
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load activities:', err);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(err as Error, { extra: { projectId } });
          });
        }
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadActivities, 30000);
    return () => clearInterval(interval);
  }, [projectId, period]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return <AlertCircle className="w-4 h-4" />;
      case 'drift':
        return <TrendingDown className="w-4 h-4" />;
      case 'api_call':
        return <Zap className="w-4 h-4" />;
      case 'cost':
        return <DollarSign className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'high':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'medium':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'low':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-slate-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
      <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
      
      {activities.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <p>No recent activity</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${getSeverityColor(activity.severity)}`}
            >
              <div className="mt-0.5">
                {getIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{activity.title}</p>
                {activity.message && (
                  <p className="text-xs opacity-75 mt-1">{activity.message}</p>
                )}
                <p className="text-xs opacity-60 mt-1">{formatTime(activity.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
