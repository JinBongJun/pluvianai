'use client';

import { useState, useEffect } from 'react';
import { activityAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Activity, Clock, TrendingUp, FileText } from 'lucide-react';
import { clsx } from 'clsx';

interface MemberActivityProps {
  projectId: number;
  userId: number;
  userEmail: string;
  userName?: string | null;
}

interface ActivityItem {
  id: number;
  activity_type: string;
  action: string;
  description?: string;
  created_at: string;
  activity_data?: any;
}

export default function MemberActivity({ projectId, userId, userEmail, userName }: MemberActivityProps) {
  const toast = useToast();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalActivities: 0,
    recentActivities: 0,
    lastActivity: null as string | null,
  });

  useEffect(() => {
    loadActivities();
  }, [projectId, userId]);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const data = await activityAPI.list({
        project_id: projectId,
        user_id: userId,
        limit: 20,
        days: 30,
      });
      setActivities(data);
      
      // Calculate stats
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const recentActivities = data.filter((a: ActivityItem) => {
        const activityDate = new Date(a.created_at);
        return activityDate >= sevenDaysAgo;
      }).length;
      
      setStats({
        totalActivities: data.length,
        recentActivities,
        lastActivity: data.length > 0 ? data[0].created_at : null,
      });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load member activities:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, userId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to load activities', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    if (type.includes('create')) return 'text-green-400 bg-green-500/20';
    if (type.includes('update')) return 'text-blue-400 bg-blue-500/20';
    if (type.includes('delete')) return 'text-red-400 bg-red-500/20';
    return 'text-slate-400 bg-slate-500/20';
  };

  if (loading) {
    return (
      <div className="text-center py-4 text-slate-400">
        Loading activities...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-xs text-slate-400 mb-1">Total Activities</div>
          <div className="text-lg font-semibold text-white">{stats.totalActivities}</div>
        </div>
        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-xs text-slate-400 mb-1">Last 7 Days</div>
          <div className="text-lg font-semibold text-white">{stats.recentActivities}</div>
        </div>
        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-xs text-slate-400 mb-1">Last Activity</div>
          <div className="text-sm font-medium text-white">
            {stats.lastActivity ? (
              new Date(stats.lastActivity).toLocaleDateString()
            ) : (
              'Never'
            )}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div>
        <h4 className="text-sm font-medium text-white mb-3">Recent Activity</h4>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activities found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className={clsx('p-2 rounded-lg', getActivityIcon(activity.activity_type))}>
                  <Activity className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{activity.action}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </div>
                  {activity.description && (
                    <p className="text-xs text-slate-400">{activity.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
