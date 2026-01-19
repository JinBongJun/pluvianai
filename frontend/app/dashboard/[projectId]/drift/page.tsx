'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import FilterPanel, { FilterState } from '@/components/filters/FilterPanel';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { driftAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';

type SortField = 'detected_at' | 'severity' | 'change_percentage' | 'drift_score';
type SortDirection = 'asc' | 'desc';

interface DriftDetection {
  id: number;
  project_id: number;
  detection_type: string;
  model: string | null;
  agent_name: string | null;
  current_value: number | null;
  baseline_value: number | null;
  change_percentage: number;
  drift_score: number;
  severity: string;
  detected_at: string;
  detection_details: any;
  affected_fields: string[] | null;
}

export default function DriftDetectionsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [detections, setDetections] = useState<DriftDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [sortField, setSortField] = useState<SortField>('detected_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return date;
    })(),
    to: new Date(),
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadDriftDetections();
  }, [projectId, filters, sortField, sortDirection, currentPage, itemsPerPage, dateRange, router]);

  const loadDriftDetections = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: Math.min(itemsPerPage * 10, 1000), // Max 1000 per backend validation
        offset: 0,
      };

      const data = await driftAPI.list(projectId, params);
      
      // Ensure data is an array (validateArrayResponse guarantees this)
      const detections: DriftDetection[] = Array.isArray(data) ? (data as unknown as DriftDetection[]) : [];
      
      // Apply client-side filtering
      let filtered = detections;
      
      // Date range filter
      if (dateRange.from || dateRange.to) {
        filtered = filtered.filter((detection: DriftDetection) => {
          const detectionDate = new Date(detection.detected_at);
          if (dateRange.from && detectionDate < dateRange.from) return false;
          if (dateRange.to) {
            const toDate = new Date(dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (detectionDate > toDate) return false;
          }
          return true;
        });
      }

      // Severity filter
      if (filters.status && filters.status !== 'all') {
        filtered = filtered.filter((detection: DriftDetection) => {
          return detection.severity === filters.status;
        });
      }

      // Detection type filter (via model filter for now)
      if (filters.model && filters.model !== 'all') {
        filtered = filtered.filter((detection: DriftDetection) => {
          return detection.detection_type === filters.model;
        });
      }

      // Agent filter
      if (filters.agentName && filters.agentName !== 'all') {
        filtered = filtered.filter((detection: DriftDetection) => {
          return detection.agent_name === filters.agentName;
        });
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter((detection: DriftDetection) => {
          return (
            detection.detection_type.toLowerCase().includes(searchLower) ||
            (detection.model && detection.model.toLowerCase().includes(searchLower)) ||
            (detection.agent_name && detection.agent_name.toLowerCase().includes(searchLower))
          );
        });
      }

      // Apply sorting
      filtered.sort((a: DriftDetection, b: DriftDetection) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

        if (sortField === 'detected_at') {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
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

      setDetections(paginated);
      setTotalItems(filtered.length);
    } catch (error: any) {
      console.error('Failed to load drift detections:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load drift detections', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
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

  const getDetectionTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
  };

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    detections.forEach((detection) => {
      if (detection.detection_type) types.add(detection.detection_type);
    });
    return Array.from(types).sort();
  }, [detections]);

  const availableAgents = useMemo(() => {
    const agents = new Set<string>();
    detections.forEach((detection) => {
      if (detection.agent_name) agents.add(detection.agent_name);
    });
    return Array.from(agents).sort();
  }, [detections]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (loading && detections.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">Drift Detections</h1>
          <p className="text-slate-400 mt-2">View and analyze model behavior changes</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Date Range Selector */}
        <div className="mb-6">
          <DateRangePicker value={dateRange} onChange={setDateRange} showPeriodLabel={true} />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            onReset={() => setFilters({})}
            availableProviders={[]}
            availableModels={availableTypes}
            availableAgents={availableAgents}
          />
        </div>

        {/* Table */}
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('detected_at')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Detected At
                      {sortField === 'detected_at' ? (
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
                    Type
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
                    <button
                      onClick={() => handleSort('change_percentage')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Change %
                      {sortField === 'change_percentage' ? (
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
                      onClick={() => handleSort('drift_score')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Drift Score
                      {sortField === 'drift_score' ? (
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
                    Model / Agent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {detections.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      No drift detections found
                    </td>
                  </tr>
                ) : (
                  detections.map((detection) => (
                    <tr key={detection.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {new Date(detection.detected_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-white">
                          {getDetectionTypeLabel(detection.detection_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getSeverityBadge(detection.severity)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            'text-sm font-medium font-mono',
                            detection.change_percentage > 50 ? 'text-red-400' :
                            detection.change_percentage > 20 ? 'text-yellow-400' :
                            'text-slate-300'
                          )}>
                            {detection.change_percentage > 0 ? '+' : ''}{toFixedSafe(detection.change_percentage, 1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={clsx(
                            'w-16 h-2 rounded-full overflow-hidden bg-slate-700',
                          )}>
                            <div
                              className={clsx(
                                'h-full transition-all',
                                detection.drift_score >= 75 ? 'bg-red-500' :
                                detection.drift_score >= 50 ? 'bg-yellow-500' :
                                detection.drift_score >= 25 ? 'bg-orange-500' :
                                'bg-slate-500'
                              )}
                              style={{ width: `${Math.min(detection.drift_score, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm text-slate-300 font-mono">
                            {toFixedSafe(detection.drift_score, 1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        <div className="flex flex-col">
                          {detection.model && (
                            <span className="font-medium">{detection.model}</span>
                          )}
                          {detection.agent_name && (
                            <span className="text-xs text-slate-400">{detection.agent_name}</span>
                          )}
                          {!detection.model && !detection.agent_name && (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/${projectId}/drift/${detection.id}`)}
                            className="flex items-center gap-2 text-purple-400 hover:text-purple-300"
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
