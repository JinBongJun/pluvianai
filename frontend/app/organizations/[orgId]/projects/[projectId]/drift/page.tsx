'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import DriftChart from '@/components/DriftChart';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { driftAPI } from '@/lib/api';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface DriftEvent {
  id: number;
  detected_at: string;
  metric: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'active' | 'resolved';
}

interface DriftData {
  total_detections: number;
  active_drifts: number;
  last_detection: string | null;
  events: DriftEvent[];
}

export default function DriftPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);
  
  const [data, setData] = useState<DriftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  
  const loadData = useCallback(async () => {
    try {
      // Fetch drift events from API
      const response = await driftAPI.list(projectId, { days });
      // Handle both array response and object with data property
      const eventList: any[] = Array.isArray(response) 
        ? response 
        : (response as any)?.data || [];
      
      setData({
        total_detections: eventList.length,
        active_drifts: eventList.filter((e: any) => e.status === 'active').length,
        last_detection: eventList.length > 0 ? eventList[0]?.detected_at : null,
        events: eventList.slice(0, 10), // Show last 10 events
      });
    } catch (error) {
      console.error('Failed to load drift data:', error);
      // Set default data on error
      setData({ total_detections: 0, active_drifts: 0, last_detection: null, events: [] });
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

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return <Badge variant="error">High</Badge>;
      case 'medium':
        return <Badge variant="warning">Medium</Badge>;
      default:
        return <Badge variant="default">Low</Badge>;
    }
  };

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Drift' },
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
              <h1 className="text-2xl font-bold text-white mb-2">Drift Detection</h1>
              <p className="text-slate-400">Monitor model performance changes and detect anomalies</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <p className="text-sm text-slate-400">Total Detections ({days}d)</p>
                </div>
                <span className="text-3xl font-bold text-white">
                  {loading ? '-' : data?.total_detections || 0}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <p className="text-sm text-slate-400">Active Drifts</p>
                </div>
                <span className="text-3xl font-bold text-white">
                  {loading ? '-' : data?.active_drifts || 0}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <p className="text-sm text-slate-400">Last Detection</p>
                </div>
                <span className="text-lg font-medium text-white">
                  {loading ? '-' : data?.last_detection ? new Date(data.last_detection).toLocaleDateString() : 'None'}
                </span>
              </div>
            </div>

            {/* Main Chart */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Drift Timeline</h2>
              <div className="h-[400px]">
                <DriftChart projectId={projectId} />
              </div>
            </div>

            {/* Drift Events */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Recent Drift Events</h2>
              {data?.events && data.events.length > 0 ? (
                <div className="space-y-3">
                  {data.events.map((event) => (
                    <div key={event.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-sm font-medium text-white">{event.metric}</p>
                          <p className="text-xs text-slate-400">{event.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getSeverityBadge(event.severity)}
                        <span className="text-xs text-slate-400">
                          {new Date(event.detected_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400/50" />
                  <p>No drift events detected</p>
                  <p className="text-sm mt-1">Your model performance is stable</p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">About Drift Detection</h2>
              <div className="text-sm text-slate-400 space-y-2">
                <p>Drift detection monitors your model for performance changes:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Data Drift:</strong> Input distribution changes over time</li>
                  <li><strong>Concept Drift:</strong> Relationship between input and output changes</li>
                  <li><strong>Performance Drift:</strong> Quality metrics degradation</li>
                </ul>
                <p className="mt-4">
                  When drift is detected, investigate the root cause and consider retraining or adjusting your prompts.
                </p>
              </div>
            </div>
          </div>
        </div>
    </ProjectLayout>
  );
}
