'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import RealTimeMetrics from '@/components/dashboard/RealTimeMetrics';
import TrendChart from '@/components/dashboard/TrendChart';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import OrgLayout from '@/components/layout/OrgLayout';
import ProjectTabs from '@/components/ProjectTabs';

export default function DashboardPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  return (
    <OrgLayout orgId={orgId}>
      <div className="min-h-screen bg-ag-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProjectTabs basePath={basePath} />
          
          <div className="mt-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
              <p className="text-slate-400">Real-time metrics and trends for your project</p>
            </div>

            {/* Real-time Metrics */}
            <RealTimeMetrics projectId={projectId} period="24h" />

            {/* Trend Chart */}
            <TrendChart projectId={projectId} period="7d" groupBy="hour" />

            {/* Activity Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <TrendChart projectId={projectId} period="30d" groupBy="day" />
              </div>
              <div>
                <ActivityFeed projectId={projectId} period="24h" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
