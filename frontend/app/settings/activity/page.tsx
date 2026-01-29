'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Pagination from '@/components/ui/Pagination';
import { activityAPI, projectsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { History, Activity, ExternalLink, Filter } from 'lucide-react';
import { clsx } from 'clsx';
import Button from '@/components/ui/Button';

interface Project {
  id: number;
  name: string;
}

export default function ActivityLogPage() {
  const router = useRouter();
  const toast = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<any>({});
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadProjects();
    loadActivities();
  }, [router, filters, currentPage, itemsPerPage]);

  const loadProjects = async () => {
    try {
      const data = await projectsAPI.list();
      setProjects(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    }
  };

  const loadActivities = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
        days: 30,
      };

      if (filters.project_id) params.project_id = filters.project_id;
      if (filters.activity_type) params.activity_type = filters.activity_type;

      const response = await activityAPI.listWithTotal(params);
      // Ensure we always get an array
      const items = Array.isArray(response) ? response : 
                    Array.isArray(response?.items) ? response.items :
                    Array.isArray(response?.data) ? response.data : [];
      setActivities(items);
      setTotalItems(response?.total || items.length);
    } catch (error: any) {
      console.error('Failed to load activities:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load activities', 'error');
      setActivities([]); // Set empty array on error
      setTotalItems(0);
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'project_create':
      case 'project_update':
      case 'project_delete':
        return <Activity className="h-4 w-4" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    if (type.includes('create')) return 'text-green-600 bg-green-50';
    if (type.includes('update')) return 'text-blue-600 bg-blue-50';
    if (type.includes('delete')) return 'text-red-600 bg-red-50';
    return 'text-ag-muted bg-white/5';
  };

  const getProjectIdFromActivity = (activity: any): number | null => {
    // Use project_id directly from activity (backend returns it)
    if (activity.project_id) {
      return activity.project_id;
    }
    // Fallback: Try to extract from activity_data
    if (activity.activity_data?.project_id) {
      return activity.activity_data.project_id;
    }
    return null;
  };

  const getProjectName = (projectId: number | null): string | null => {
    if (!projectId) return null;
    const project = projects.find(p => p.id === projectId);
    return project?.name || null;
  };

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== '' && v !== 'all'
  ).length;

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <DashboardLayout>
      <div className="bg-ag-bg min-h-screen">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Activity Log</h1>
            <p className="text-slate-400 mt-1">View your account activity history</p>
          </div>

          {/* Filters */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 text-sm font-medium text-ag-text hover:text-ag-accentLight transition-colors"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFiltersCount > 0 && (
                    <span className="bg-ag-accent text-ag-text text-xs px-2 py-0.5 rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={() => setFilters({})}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {showFilters && (
                <div className="space-y-4 pt-4 border-t border-white/10">
                  {/* Project Filter */}
                  {projects.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-white mb-1">
                        Project
                      </label>
                      <select
                        value={filters.project_id || ''}
                        onChange={(e) => setFilters({ ...filters, project_id: e.target.value || undefined })}
                        className="w-full bg-[#1e293b] border border-white/10 rounded-md text-white focus:ring-ag-accent focus:border-ag-accent px-3 py-2"
                      >
                        <option value="" className="bg-[#1e293b] text-white">All projects</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id} className="bg-[#1e293b] text-white">
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Activity Type Filter */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      Activity Type
                    </label>
                    <select
                      value={filters.activity_type || ''}
                      onChange={(e) => setFilters({ ...filters, activity_type: e.target.value || undefined })}
                      className="w-full bg-[#1e293b] border border-white/10 rounded-md text-white focus:ring-ag-accent focus:border-ag-accent px-3 py-2"
                    >
                      <option value="" className="bg-[#1e293b] text-white">All types</option>
                      <option value="project_create" className="bg-[#1e293b] text-white">Project Created</option>
                      <option value="project_update" className="bg-[#1e293b] text-white">Project Updated</option>
                      <option value="project_delete" className="bg-[#1e293b] text-white">Project Deleted</option>
                      <option value="member_add" className="bg-[#1e293b] text-white">Member Added</option>
                      <option value="member_remove" className="bg-[#1e293b] text-white">Member Removed</option>
                      <option value="settings_update" className="bg-[#1e293b] text-white">Settings Updated</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Active Filters */}
              {activeFiltersCount > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
                  {Object.entries(filters).map(([key, value]) => {
                    if (!value || value === '' || value === 'all') return null;
                    const displayValue = key === 'project_id' 
                      ? getProjectName(Number(value)) || `Project ${value}`
                      : String(value);
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-ag-accent/20 text-ag-text text-xs rounded border border-ag-accent/30"
                      >
                        {key === 'project_id' ? 'Project' : key}: {displayValue}
                        <button
                          onClick={() => setFilters({ ...filters, [key]: undefined })}
                          className="hover:text-ag-accentLight transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

            {/* Activity List */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading...</div>
            ) : activities.length === 0 ? (
              <div className="p-12 text-center">
                <History className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No activity</h3>
                <p className="text-sm text-slate-400">Your activity history will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {activities.map((activity) => {
                  const projectId = getProjectIdFromActivity(activity);
                  const projectName = getProjectName(projectId);
                  return (
                    <div key={activity.id} className="p-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className={clsx(
                          'p-2 rounded-lg',
                          activity.activity_type?.includes('create') ? 'text-green-400 bg-green-500/20' :
                          activity.activity_type?.includes('update') ? 'text-blue-400 bg-blue-500/20' :
                          activity.activity_type?.includes('delete') ? 'text-red-400 bg-red-500/20' :
                          'text-slate-400 bg-slate-500/20'
                        )}>
                          {getActivityIcon(activity.activity_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-white">{activity.action}</span>
                            <span className="text-xs text-slate-500">
                              {new Date(activity.created_at).toLocaleString()}
                            </span>
                          </div>
                          {activity.description && (
                            <p className="text-sm text-slate-300">{activity.description}</p>
                          )}
                          {projectId && projectName && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-slate-400">Project:</span>
                              <Link
                                href={`/dashboard/${projectId}`}
                                className="text-xs text-ag-accent hover:text-ag-accentLight flex items-center gap-1 transition-colors"
                              >
                                {projectName}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                          )}
                          {activity.activity_data && Object.keys(activity.activity_data).length > 0 && (
                            <div className="mt-2 text-xs text-slate-500 font-mono bg-white/5 p-2 rounded">
                              {JSON.stringify(activity.activity_data, null, 2)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
