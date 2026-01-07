'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Pagination from '@/components/ui/Pagination';
import FilterPanel from '@/components/filters/FilterPanel';
import { activityAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { History, Activity } from 'lucide-react';
import { clsx } from 'clsx';

export default function ActivityLogPage() {
  const router = useRouter();
  const toast = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<any>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadActivities();
  }, [router, filters, currentPage, itemsPerPage]);

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

      const data = await activityAPI.list(params);
      setActivities(data);
      setTotalItems(data.length); // In production, get total from API
    } catch (error: any) {
      console.error('Failed to load activities:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load activities', 'error');
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
    return 'text-gray-600 bg-gray-50';
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Activity Log</h1>
          <p className="text-gray-600 mt-1">View your account activity history</p>
        </div>

        {/* Activity List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading...</div>
          ) : activities.length === 0 ? (
            <div className="p-12 text-center">
              <History className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No activity</h3>
              <p className="text-sm text-gray-600">Your activity history will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {activities.map((activity) => (
                <div key={activity.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={clsx('p-2 rounded-lg', getActivityColor(activity.activity_type))}>
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{activity.action}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(activity.created_at).toLocaleString()}
                        </span>
                      </div>
                      {activity.description && (
                        <p className="text-sm text-gray-600">{activity.description}</p>
                      )}
                      {activity.activity_data && (
                        <div className="mt-2 text-xs text-gray-500">
                          {JSON.stringify(activity.activity_data)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
    </DashboardLayout>
  );
}

