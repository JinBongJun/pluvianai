'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { projectsAPI, qualityAPI, costAPI, apiCallsAPI, projectMembersAPI } from '@/lib/api';
import QualityChart from '@/components/QualityChart';
import DriftChart from '@/components/DriftChart';
import StatsCard from '@/components/StatsCard';
import MemberList from '@/components/MemberList';
import ProjectSettings from '@/components/ProjectSettings';

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
      const [projectData, qualityStats, costAnalysis, apiCalls] = await Promise.all([
        projectsAPI.get(projectId),
        qualityAPI.getStats(projectId, 7),
        costAPI.getAnalysis(projectId, 7),
        apiCallsAPI.list(projectId, { limit: 1 }),
      ]);

      setProject(projectData);
      setStats(qualityStats);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const canManage = userRole === 'owner' || userRole === 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <button
                onClick={() => router.push('/dashboard')}
                className="text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{project?.name}</h1>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                router.push('/login');
              }}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'members'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Team Members
            </button>
            {canManage && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'settings'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
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
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Scores</h2>
                <QualityChart projectId={projectId} />
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Drift Detections</h2>
                <DriftChart projectId={projectId} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="bg-white rounded-lg shadow p-6">
            <MemberList projectId={projectId} canManage={canManage} />
          </div>
        )}

        {activeTab === 'settings' && canManage && (
          <ProjectSettings projectId={projectId} project={project} onUpdate={loadProjectData} />
        )}
      </main>
    </div>
  );
}

