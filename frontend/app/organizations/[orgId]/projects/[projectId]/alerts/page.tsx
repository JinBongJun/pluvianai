'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProjectLayout from '@/components/layout/ProjectLayout';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { alertsAPI, organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Bell, CheckCircle, XCircle, AlertTriangle, Send, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';
import useSWR from 'swr';

type SortField = 'created_at' | 'severity' | 'alert_type';
type SortDirection = 'asc' | 'desc';

interface Alert {
  id: number;
  project_id: number;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  alert_data: any;
  is_sent: boolean;
  sent_at: string | null;
  notification_channels: string[] | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: number | null;
  created_at: string;
}

export default function AlertsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: false }),
  );

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [filters, setFilters] = useState({
    alert_type: 'all' as string,
    severity: 'all' as string,
    is_resolved: 'all' as string,
  });
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date;
    })(),
    to: new Date(),
  });
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]); // For client-side filtering
  const [recentWorstLiveCount, setRecentWorstLiveCount] = useState(0);
  const [recentWorstTestLabCount, setRecentWorstTestLabCount] = useState(0);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: 1000, // Max limit per backend validation
        offset: 0,
      };

      // Apply server-side filters
      if (filters.alert_type && filters.alert_type !== 'all') {
        params.alert_type = filters.alert_type;
      }
      if (filters.severity && filters.severity !== 'all') {
        params.severity = filters.severity;
      }
      if (filters.is_resolved !== 'all') {
        params.is_resolved = filters.is_resolved === 'resolved';
      }

      const data = await alertsAPI.list(projectId, params);
      
      // Store all alerts for client-side filtering
      setAllAlerts(data);

      // Compute recent worst-case alert counts (last 24h, unresolved)
      const now = new Date();
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentWorst = (data || []).filter((alert: Alert) => {
        if (alert.alert_type !== 'worst_case') return false;
        if (alert.is_resolved) return false;
        const createdAt = new Date(alert.created_at);
        return createdAt >= cutoff;
      });
      setRecentWorstLiveCount(
        recentWorst.filter((a: any) => a.alert_data?.target === 'live_view').length,
      );
      setRecentWorstTestLabCount(
        recentWorst.filter((a: any) => a.alert_data?.target === 'test_lab').length,
      );
      
      // Apply client-side date range filtering
      let filtered = data;
      if (dateRange.from || dateRange.to) {
        filtered = filtered.filter((alert: Alert) => {
          const alertDate = new Date(alert.created_at);
          if (dateRange.from && alertDate < dateRange.from) return false;
          if (dateRange.to) {
            const toDate = new Date(dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (alertDate > toDate) return false;
          }
          return true;
        });
      }

      // Apply sorting
      filtered.sort((a: Alert, b: Alert) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

        if (sortField === 'created_at') {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        } else if (sortField === 'severity') {
          // Severity order: critical > high > medium > low
          const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
          aVal = severityOrder[aVal] || 0;
          bVal = severityOrder[bVal] || 0;
        }

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (sortDirection === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });

      // Apply pagination
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginated = filtered.slice(startIndex, endIndex);

      setAlerts(paginated);
      setTotalItems(filtered.length);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load alerts:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
      
      // Only show error toast for actual API failures, not empty results
      const status = error.response?.status;
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to load alerts';
      
      // 404 or empty results should not show error toast
      if (status !== 404 && status !== 200) {
        toast.showToast(errorMessage, 'error');
      }
      
      if (status === 401) {
        router.push('/login');
      }
      
      // Set empty arrays on error (graceful degradation)
      setAlerts([]);
      setAllAlerts([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [
    alertsAPI,
    projectId,
    filters.alert_type,
    filters.severity,
    filters.is_resolved,
    dateRange.from,
    dateRange.to,
    sortField,
    sortDirection,
    currentPage,
    itemsPerPage,
    toast,
    router,
  ]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    if (!projectId || isNaN(projectId) || projectId <= 0) {
      if (orgId) {
        router.push(`/organizations/${orgId}/projects`);
      } else {
        router.push('/organizations');
      }
      return;
    }

    void loadAlerts();
  }, [projectId, orgId, router, loadAlerts]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const handleResolve = async (alertId: number) => {
    try {
      await alertsAPI.resolve(alertId);
      toast.showToast('Alert resolved successfully', 'success');
      loadAlerts();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to resolve alert:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, alertId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to resolve alert', 'error');
    }
  };

  const handleSend = async (alertId: number) => {
    try {
      await alertsAPI.send(alertId);
      toast.showToast('Alert sent successfully', 'success');
      loadAlerts();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send alert:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, alertId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to send alert', 'error');
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="error">Critical</Badge>;
      case 'high':
        return <Badge variant="warning">High</Badge>;
      case 'medium':
        return <Badge variant="default">Medium</Badge>;
      case 'low':
        return <Badge variant="success">Low</Badge>;
      default:
        return <Badge variant="default">{severity}</Badge>;
    }
  };

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      drift: 'Drift Detection',
      cost_spike: 'Cost Anomaly',
      error: 'Error',
      timeout: 'Timeout',
      model_update: 'Model Update',
      quality_drop: 'Quality Drop',
    };
    return labels[type] || type;
  };

  // Default alert types from backend model (even if no data exists yet)
  const defaultAlertTypes = ['drift', 'cost_spike', 'error', 'timeout', 'model_update', 'shadow_routing'];
  
  const availableTypes = useMemo(() => {
    const types = new Set<string>(defaultAlertTypes); // Start with defaults
    allAlerts.forEach((alert) => {
      if (alert.alert_type) types.add(alert.alert_type);
    });
    return Array.from(types).sort();
  }, [allAlerts]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handleAlertNavigate = (alert: Alert) => {
    const data = alert.alert_data || {};
    if (alert.alert_type === 'worst_case' && data?.target) {
      if (data.target === 'live_view') {
        const params = new URLSearchParams();
        if (data.agent_id) params.set('agent', String(data.agent_id));
        params.set('view', 'worst');
        const qs = params.toString();
        router.push(
          `/organizations/${orgId}/projects/${projectId}/live-view${qs ? `?${qs}` : ''}`,
        );
        return;
      }
      if (data.target === 'test_lab') {
        const params = new URLSearchParams();
        if (data.test_run_id) params.set('run_id', String(data.test_run_id));
        params.set('view', 'worst');
        const qs = params.toString();
        router.push(
          `/organizations/${orgId}/projects/${projectId}/test-lab${qs ? `?${qs}` : ''}`,
        );
        return;
      }
    }
    // Fallback: go to alert detail
    router.push(`/organizations/${orgId}/projects/${projectId}/alerts/${alert.id}`);
  };

  if (!orgId) {
    return null;
  }

  if (loading && alerts.length === 0) {
    return (
      <ProjectLayout
        orgId={orgId}
        projectId={projectId}
        breadcrumb={[
          { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
          { label: 'Alerts' },
        ]}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-ag-accent/20 border-t-ag-accent"></div>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Alerts' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">Alerts</h1>
          <p className="text-slate-400 mt-2">View and manage project alerts</p>
        </div>

        {/* Tabs */}
        <ProjectTabs
          projectId={projectId}
          orgId={orgId}
          worstAlertCounts={{
            liveView: recentWorstLiveCount,
            testLab: recentWorstTestLabCount,
          }}
        />

        {/* Filters */}
        <div className="mb-6">
          {/* Date Range */}
          <div className="mb-4">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          
          {/* Filter dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Alert Type</label>
            <Select
              value={filters.alert_type}
              onChange={(value) => {
                setFilters({ ...filters, alert_type: value || 'all' });
                setCurrentPage(1);
              }}
              placeholder="All types..."
              options={[
                { value: 'all', label: 'All Types' },
                ...availableTypes.map((type) => ({
                  value: type,
                  label: getAlertTypeLabel(type),
                })),
              ]}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Severity</label>
            <Select
              value={filters.severity}
              onChange={(value) => {
                setFilters({ ...filters, severity: value || 'all' });
                setCurrentPage(1);
              }}
              placeholder="All severities..."
              options={[
                { value: 'all', label: 'All Severities' },
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Status</label>
            <Select
              value={filters.is_resolved}
              onChange={(value) => {
                setFilters({ ...filters, is_resolved: value || 'all' });
                setCurrentPage(1);
              }}
              placeholder="All statuses..."
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'unresolved', label: 'Unresolved' },
                { value: 'resolved', label: 'Resolved' },
              ]}
              className="w-full"
            />
          </div>
          </div>
        </div>

        {/* Table */}
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('created_at')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Created At
                      {sortField === 'created_at' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-50" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('alert_type')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Type
                      {sortField === 'alert_type' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-50" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('severity')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Severity
                      {sortField === 'severity' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-50" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Notification
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-ag-accent border-t-transparent"></div>
                        </div>
                      ) : (
                        <div>
                          <Bell className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                          <p>No alerts found</p>
                          <p className="text-sm mt-2 text-slate-500">
                            {filters.alert_type !== 'all' || filters.severity !== 'all' || filters.is_resolved !== 'all' || dateRange.from || dateRange.to
                              ? 'Try adjusting your filters'
                              : 'Alerts will appear here when issues are detected'}
                          </p>
                          {(filters.alert_type !== 'all' || filters.severity !== 'all' || filters.is_resolved !== 'all' || dateRange.from || dateRange.to) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFilters({ alert_type: 'all', severity: 'all', is_resolved: 'all' });
                                setDateRange({ from: null, to: null });
                                setCurrentPage(1);
                              }}
                              className="mt-4"
                            >
                              Clear Filters
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {new Date(alert.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-white">
                          {getAlertTypeLabel(alert.alert_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-white max-w-md truncate" title={alert.title}>
                          {alert.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 max-w-md truncate" title={alert.message}>
                          {alert.message}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getSeverityBadge(alert.severity)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {alert.is_resolved ? (
                          <Badge variant="success">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {alert.is_sent ? (
                          <Badge variant="success">
                            <Send className="h-3 w-3 mr-1" />
                            Sent
                          </Badge>
                        ) : (
                          <Badge variant="default">Not Sent</Badge>
                        )}
                        {alert.sent_at && (
                          <div className="text-xs text-slate-400 mt-1">
                            {new Date(alert.sent_at).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {!alert.is_sent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSend(alert.id)}
                              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300"
                              title="Send alert"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {!alert.is_resolved && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResolve(alert.id)}
                              className="flex items-center gap-1.5 text-green-400 hover:text-green-300"
                              title="Resolve alert"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAlertNavigate(alert)}
                            className="flex items-center gap-1.5 text-ag-accent hover:text-ag-accentLight"
                            title="View details or jump to source"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newItemsPerPage) => {
                setItemsPerPage(newItemsPerPage);
                setCurrentPage(1);
              }}
              className="bg-transparent"
            />
          </div>
        )}

        {/* Show info when filters are applied */}
        {(filters.alert_type !== 'all' || filters.severity !== 'all' || filters.is_resolved !== 'all' || dateRange.from || dateRange.to) && totalItems > 0 && (
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400">
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} filtered results
            </p>
          </div>
        )}
      </div>
    </ProjectLayout>
  );
}
