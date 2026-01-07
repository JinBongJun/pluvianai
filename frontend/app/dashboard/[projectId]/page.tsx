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

    loadProjectData();
  }, [projectId, router]);

  const loadProjectData = async () => {
    try {
      const [projectData, qualityStats, costAnalysis, apiCallStats] = await Promise.all([
        projectsAPI.get(projectId),
        qualityAPI.getStats(projectId, 7),
        costAPI.getAnalysis(projectId, 7),
        apiCallsAPI.getStats(projectId, 7),
      ]);

      setProject(projectData);
      // Merge quality stats with API call stats for success rate
      setStats({
        ...qualityStats,
        total_calls: apiCallStats.total_calls,
        success_rate: apiCallStats.success_rate,
      });
      setCostData(costAnalysis);
      
      // Determine user role
      const role = projectData.role || 'viewer';
      setUserRole(role);
    } catch (error) {
      console.error('Failed to load project data:', error);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      </DashboardLayout>
    );
  }

  const canManage = userRole === 'owner' || userRole === 'admin';

  return (
    <DashboardLayout>
      <div>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{project?.name}</h1>
          {project?.description && (
            <p className="text-gray-600 mt-2">{project.description}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'overview'
                  ? 'border-black text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              Overview
            </button>
            <button
              onClick={() => router.push(`/dashboard/${projectId}/api-calls`)}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              API Calls
            </button>
            <button
              onClick={() => router.push(`/dashboard/${projectId}/compare`)}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              Compare
            </button>
            <button
              onClick={() => router.push(`/dashboard/${projectId}/reports`)}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              Reports
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={clsx(
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'members'
                  ? 'border-black text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              Team Members
            </button>
            {canManage && (
              <button
                onClick={() => setActiveTab('settings')}
                className={clsx(
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'settings'
                    ? 'border-black text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                Settings
              </button>
            )}
          </nav>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
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

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Scores</h2>
                <QualityChart projectId={projectId} />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Drift Detections</h2>
                <DriftChart projectId={projectId} />
              </div>
            </div>
          </div>
        )}


        {activeTab === 'members' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <MemberList projectId={projectId} canManage={canManage} />
          </div>
        )}

        {activeTab === 'settings' && canManage && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <ProjectSettings projectId={projectId} project={project} onUpdate={loadProjectData} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
