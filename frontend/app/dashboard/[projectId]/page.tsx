'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import { projectsAPI, qualityAPI, costAPI, apiCallsAPI } from '@/lib/api';
import QualityChart from '@/components/QualityChart';
import DriftChart from '@/components/DriftChart';
import StatsCard from '@/components/StatsCard';
import MemberList from '@/components/MemberList';
import ProjectSettings from '@/components/ProjectSettings';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { clsx } from 'clsx';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = Number(params.projectId);
  
  const [project, setProject] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [costData, setCostData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'settings'>('overview');
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | 'viewer'>('viewer');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      console.error('Invalid project ID:', params.projectId);
      router.push('/dashboard');
      return;
    }

    loadProjectData();
  }, [projectId, router]);

  const loadProjectData = async () => {
    try {
      // Load data sequentially to better handle errors
      const projectData = await projectsAPI.get(projectId);
      
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
        // Project not found, redirect to dashboard
        router.push('/dashboard');
      } else if (error?.response?.status === 403) {
        // Access denied
        router.push('/dashboard');
      } else {
        // Other errors - still show page but with error state
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-200 border-t-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  const canManage = userRole === 'owner' || userRole === 'admin';

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">{project?.name}</h1>
          {project?.description && (
            <p className="text-slate-400 mt-2">{project.description}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-white/10 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200',
                activeTab === 'overview'
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-white/20'
              )}
            >
              Overview
            </button>
            <button
              onClick={() => router.push(`/dashboard/${projectId}/api-calls`)}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                'border-transparent text-slate-400 hover:text-slate-300 hover:border-white/20'
              )}
            >
              API Calls
            </button>
            <button
              onClick={() => router.push(`/dashboard/${projectId}/compare`)}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                'border-transparent text-slate-400 hover:text-slate-300 hover:border-white/20'
              )}
            >
              Compare
            </button>
            <button
              onClick={() => router.push(`/dashboard/${projectId}/reports`)}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                'border-transparent text-slate-400 hover:text-slate-300 hover:border-white/20'
              )}
            >
              Reports
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200',
                activeTab === 'members'
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-white/20'
              )}
            >
              Team Members
            </button>
            {canManage && (
              <button
                onClick={() => setActiveTab('settings')}
                className={clsx(
                  'py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200',
                  activeTab === 'settings'
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-white/20'
                )}
              >
                Settings
              </button>
            )}
          </nav>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Bento Grid - Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total API Calls"
                value={stats?.total_calls || 0}
                subtitle="Last 7 days"
              />
              <StatsCard
                title="Avg Quality Score"
                value={stats?.avg_score ? `${stats.avg_score.toFixed(1)}%` : 'N/A'}
                subtitle="Last 7 days"
              />
              <StatsCard
                title="Total Cost"
                value={costData?.total_cost ? `$${costData.total_cost.toFixed(2)}` : '$0.00'}
                subtitle="Last 7 days"
              />
              <StatsCard
                title="Success Rate"
                value={stats?.success_rate ? `${(stats.success_rate * 100).toFixed(1)}%` : 'N/A'}
                subtitle="Last 7 days"
              />
            </div>

            {/* Charts - Bento Grid Style */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-purple">
                <h2 className="text-lg font-semibold text-white mb-4">Quality Scores</h2>
                <QualityChart projectId={projectId} />
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-purple">
                <h2 className="text-lg font-semibold text-white mb-4">Drift Detections</h2>
                <DriftChart projectId={projectId} />
              </div>
            </div>
          </div>
        )}


        {activeTab === 'members' && (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <MemberList projectId={projectId} canManage={canManage} />
          </div>
        )}

        {activeTab === 'settings' && canManage && (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <ProjectSettings projectId={projectId} project={project} onUpdate={loadProjectData} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
