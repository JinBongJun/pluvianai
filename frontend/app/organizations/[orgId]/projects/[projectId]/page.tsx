'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ToastContainer';
import { projectsAPI, qualityAPI, costAPI, apiCallsAPI, adminAPI, organizationsAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import QualityChart from '@/components/QualityChart';
import DriftChart from '@/components/DriftChart';
import CostChart from '@/components/CostChart';
import StatsCard from '@/components/StatsCard';
import MemberList from '@/components/MemberList';
import ProjectSettings from '@/components/ProjectSettings';
import OrgLayout from '@/components/layout/OrgLayout';
import EmptyState from '@/components/EmptyState';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';
import { HelpCircle } from 'lucide-react';
import useSWR from 'swr';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const toast = useToast();
  const orgId = params?.orgId as string;
  const projectId = Number(params.projectId);
  
  const [project, setProject] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [costData, setCostData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | 'viewer'>('viewer');
  
  // Get active tab from URL params
  const activeTab = (searchParams?.get('tab') || 'overview') as 'overview' | 'members' | 'settings';

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: false }),
  );

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      console.error('Invalid project ID:', params.projectId);
      if (orgId) {
        router.push(`/organizations/${orgId}/projects`);
      } else {
        router.push('/organizations');
      }
      return;
    }

    loadProjectData();
  }, [projectId, orgId, router, searchParams]);

  const loadProjectData = async () => {
    try {
      // Load data sequentially to better handle errors
      const projectData = await projectsAPI.get(projectId);
      
      // Verify project belongs to this org
      if (projectData.organization_id && Number(orgId) !== projectData.organization_id) {
        router.push(`/organizations/${projectData.organization_id}/projects/${projectId}`);
        return;
      }
      
      // Load stats in parallel (with error handling for each)
      const [qualityStats, costAnalysis, apiCallStats] = await Promise.allSettled([
        qualityAPI.getStats(projectId, 7),
        costAPI.getAnalysis(projectId, 7),
        apiCallsAPI.getStats(projectId, 7),
      ]);

      setProject(projectData);
      
      // Handle stats results (use defaults if failed)
      const qualityStatsData = qualityStats.status === 'fulfilled' ? qualityStats.value : null;
      const costAnalysisData = costAnalysis.status === 'fulfilled' ? costAnalysis.value : null;
      const apiCallStatsData = apiCallStats.status === 'fulfilled' ? apiCallStats.value : null;
      
      // Log individual errors
      if (qualityStats.status === 'rejected') {
        console.warn('Failed to load quality stats:', qualityStats.reason);
      }
      if (costAnalysis.status === 'rejected') {
        console.warn('Failed to load cost analysis:', costAnalysis.reason);
      }
      if (apiCallStats.status === 'rejected') {
        console.warn('Failed to load API call stats:', apiCallStats.reason);
      }
      
      // Merge quality stats with API call stats for success rate
      setStats({
        ...(qualityStatsData || {}),
        total_calls: apiCallStatsData?.total_calls || 0,
        success_rate: apiCallStatsData?.success_rate || 0,
      });
      setCostData(costAnalysisData || { total_cost: 0, by_model: {}, by_provider: {}, by_day: [], average_daily_cost: 0 });
      
      // Determine user role
      const role = projectData.role || 'viewer';
      setUserRole(role);
    } catch (error: any) {
      console.error('Failed to load project data:', error);
      if (error?.response?.status === 404) {
        // Project not found, redirect to org projects
        if (orgId) {
          router.push(`/organizations/${orgId}/projects`);
        } else {
          router.push('/organizations');
        }
      } else if (error?.response?.status === 403) {
        // Access denied
        if (orgId) {
          router.push(`/organizations/${orgId}/projects`);
        } else {
          router.push('/organizations');
        }
      } else {
        // Other errors - still show page but with error state
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!orgId) {
    return null;
  }

  if (loading) {
    return (
      <OrgLayout
        orgId={orgId}
        breadcrumb={[
          { label: 'Organizations', href: '/organizations' },
          { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
          { label: 'Loading...' },
        ]}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500/20 border-t-purple-500"></div>
        </div>
      </OrgLayout>
    );
  }

  const canManage = userRole === 'owner' || userRole === 'admin';

  const handleGenerateSampleData = async () => {
    if (!confirm('This will generate sample data for this project. Continue?')) {
      return;
    }

    setGenerating(true);
    try {
      await adminAPI.generateSampleData(projectId);
      toast.showToast('Sample data generated successfully! Refreshing...', 'success');
      // Reload data after a short delay
      setTimeout(() => {
        loadProjectData();
      }, 1000);
    } catch (error: any) {
      console.error('Failed to generate sample data:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to generate sample data', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const hasNoData = (stats?.total_calls || 0) === 0;

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: project?.name || 'Project' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-3xl font-bold text-white">{project?.name}</h1>
              <p className="text-slate-400 mt-2 text-sm">
                Monitor API calls, quality, cost, and drift at a glance
              </p>
            </div>
            {hasNoData && canManage && (
              <Button
                onClick={handleGenerateSampleData}
                disabled={generating}
                size="sm"
              >
                {generating ? 'Generating...' : 'Generate Data'}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} orgId={orgId} canManage={canManage} />

        {/* Tab Content */}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold text-white">Key Metrics</h2>
                <div className="group relative">
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                  <div className="absolute left-0 top-6 w-64 p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <p>Performance metrics for the last 7 days. Click each card to view detailed analysis.</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatsCard
                  title="API Calls"
                  value={stats?.total_calls || 0}
                  subtitle="Total calls in last 7 days"
                />
                <StatsCard
                  title="Quality"
                  value={stats?.avg_score != null ? `${toFixedSafe(stats.avg_score, 1)}%` : 'N/A'}
                  subtitle="Average quality score"
                />
                <StatsCard
                  title="Cost"
                  value={costData?.total_cost != null ? `$${toFixedSafe(costData.total_cost, 2)}` : '$0.00'}
                  subtitle="Total cost"
                />
                <StatsCard
                  title="Success"
                  value={stats?.success_rate != null ? `${toFixedSafe(stats.success_rate * 100, 1)}%` : 'N/A'}
                  subtitle="Success rate"
                />
              </div>
            </div>

            {/* Charts */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold text-white">Trend Analysis</h2>
                <div className="group relative">
                  <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                  <div className="absolute left-0 top-6 w-64 p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <p>Visualize changes in quality, cost, and drift over time. Click each chart to view detailed pages.</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-white">Quality Score</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Quality score trends over time</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/organizations/${orgId}/projects/${projectId}/quality`)}
                      className="text-xs"
                    >
                      View Details →
                    </Button>
                  </div>
                  <QualityChart projectId={projectId} />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-white">Cost Analysis</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Daily LLM API costs</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/organizations/${orgId}/projects/${projectId}/cost`)}
                      className="text-xs"
                    >
                      View Details →
                    </Button>
                  </div>
                  <CostChart projectId={projectId} days={7} />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-white">Drift Detection</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Model performance change detection</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/organizations/${orgId}/projects/${projectId}/drift`)}
                      className="text-xs"
                    >
                      View Details →
                    </Button>
                  </div>
                  <DriftChart projectId={projectId} />
                </div>
              </div>
            </div>
          </div>
        )}


        {activeTab === 'members' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <MemberList projectId={projectId} canManage={canManage} />
          </div>
        )}

        {activeTab === 'settings' && canManage && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <ProjectSettings projectId={projectId} project={project} onUpdate={loadProjectData} />
          </div>
        )}
      </div>
    </OrgLayout>
  );
}
