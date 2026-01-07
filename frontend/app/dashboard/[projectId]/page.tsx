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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/973f1af9-b9db-4390-8449-a237ac30d6a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:37',message:'loadProjectData entry',data:{projectId,projectIdType:typeof projectId},timestamp:Date.now(),sessionId:'debug-session'})}).catch(()=>{});
    // #endregion
    try {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/973f1af9-b9db-4390-8449-a237ac30d6a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:39',message:'Before Promise.all',data:{projectId},timestamp:Date.now(),sessionId:'debug-session'})}).catch(()=>{});
      // #endregion
      
      // Load data sequentially to better handle errors
      const projectData = await projectsAPI.get(projectId);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/973f1af9-b9db-4390-8449-a237ac30d6a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:43',message:'After projectData',data:{projectData:!!projectData},timestamp:Date.now(),sessionId:'debug-session'})}).catch(()=>{});
      // #endregion
      
      // Load stats in parallel (with error handling for each)
      const [qualityStats, costAnalysis, apiCallStats] = await Promise.allSettled([
        qualityAPI.getStats(projectId, 7),
        costAPI.getAnalysis(projectId, 7),
        apiCallsAPI.getStats(projectId, 7),
      ]);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/973f1af9-b9db-4390-8449-a237ac30d6a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:50',message:'After Promise.allSettled',data:{qualityStats_status:qualityStats.status,costAnalysis_status:costAnalysis.status,apiCallStats_status:apiCallStats.status},timestamp:Date.now(),sessionId:'debug-session'})}).catch(()=>{});
      // #endregion

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
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/973f1af9-b9db-4390-8449-a237ac30d6a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:75',message:'loadProjectData error',data:{error_message:error?.message,error_status:error?.response?.status,error_data:error?.response?.data,error_response:JSON.stringify(error?.response?.data)},timestamp:Date.now(),sessionId:'debug-session'})}).catch(()=>{});
      // #endregion
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
