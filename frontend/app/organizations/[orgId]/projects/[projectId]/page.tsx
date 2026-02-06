'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ToastContainer';
import { projectsAPI, apiCallsAPI, adminAPI, organizationsAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import StatsCard from '@/components/StatsCard';
import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import useSWR from 'swr';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const [project, setProject] = useState<any>(null);
  const [stats, setStats] = useState<{ total_calls?: number; success_rate?: number } | null>(null);
  const [retentionSummary, setRetentionSummary] = useState<{
    plan_type: string;
    retention_days: number;
    total_snapshots: number;
    expiring_soon: number;
    cutoff_date: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | 'viewer'>('viewer');

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: false }),
  );

  const loadProjectData = useCallback(async () => {
    try {
      const projectData = await projectsAPI.get(projectId);

      if (projectData.organization_id && Number(orgId) !== projectData.organization_id) {
        router.push(`/organizations/${projectData.organization_id}/projects/${projectId}`);
        return;
      }

      const [apiCallStats, retentionResult] = await Promise.allSettled([
        apiCallsAPI.getStats(projectId, 7),
        projectsAPI.getDataRetentionSummary(projectId),
      ]);

      setProject(projectData);
      if (retentionResult.status === 'fulfilled') {
        setRetentionSummary(retentionResult.value);
      } else {
        setRetentionSummary(null);
      }

      const apiCallStatsData = apiCallStats.status === 'fulfilled' ? apiCallStats.value : null;
      setStats({
        total_calls: apiCallStatsData?.total_calls || 0,
        success_rate: apiCallStatsData?.success_rate ?? 0,
      });
      setUserRole(projectData.role || 'viewer');
    } catch (error: any) {
      console.error('Failed to load project data:', error);
      if (error?.response?.status === 404 || error?.response?.status === 403) {
        if (orgId) router.push(`/organizations/${orgId}/projects`);
        else router.push('/organizations');
      } else {
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId, router]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      if (orgId) router.push(`/organizations/${orgId}/projects`);
      else router.push('/organizations');
      return;
    }
    loadProjectData();
  }, [projectId, orgId, router, loadProjectData]);

  if (!orgId) return null;

  if (loading) {
    return (
      <ProjectLayout
        orgId={orgId}
        projectId={projectId}
        breadcrumb={[
          { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
          { label: 'Loading...' },
        ]}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-ag-accent/20 border-t-ag-accent" />
        </div>
      </ProjectLayout>
    );
  }

  const canManage = userRole === 'owner' || userRole === 'admin';
  const hasNoData = (stats?.total_calls ?? 0) === 0;

  const handleGenerateSampleData = async () => {
    if (!confirm('This will generate sample data for this project. Continue?')) return;
    setGenerating(true);
    try {
      await adminAPI.generateSampleData(projectId);
      toast.showToast('Sample data generated successfully! Refreshing...', 'success');
      setTimeout(() => loadProjectData(), 1000);
    } catch (error: any) {
      console.error('Failed to generate sample data:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to generate sample data', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: project?.name || 'Project' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-3xl font-bold text-white">{project?.name}</h1>
              <p className="text-slate-400 mt-2 text-sm">
                Live View, Test Lab, API Calls, Signals, and more
              </p>
              {retentionSummary && (
                <p className="text-ag-muted text-sm mt-1">
                  데이터 보관: {retentionSummary.retention_days}일
                </p>
              )}
            </div>
            {hasNoData && canManage && (
              <Button onClick={handleGenerateSampleData} disabled={generating} size="sm">
                {generating ? 'Generating...' : 'Generate Data'}
              </Button>
            )}
          </div>
        </div>

        <ProjectTabs projectId={projectId} orgId={orgId} canManage={canManage} />

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatsCard
                title="API Calls"
                value={stats?.total_calls ?? 0}
                subtitle="Last 7 days"
              />
              <StatsCard
                title="Success Rate"
                value={
                  stats?.success_rate != null
                    ? `${toFixedSafe(stats.success_rate * 100, 1)}%`
                    : 'N/A'
                }
                subtitle="Last 7 days"
              />
            </div>
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}
