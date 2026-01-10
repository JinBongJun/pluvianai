'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import FilterPanel, { FilterState } from '@/components/filters/FilterPanel';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { apiCallsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import ExportButton from '@/components/export/ExportButton';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';

type SortField = 'created_at' | 'latency_ms' | 'status_code';
type SortDirection = 'asc' | 'desc';

export default function APICallsListPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [apiCalls, setApiCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadAPICalls();
  }, [projectId, filters, sortField, sortDirection, currentPage, itemsPerPage, router]);

  const loadAPICalls = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      };

      if (filters.provider) params.provider = filters.provider;
      if (filters.model) params.model = filters.model;
      if (filters.agentName) params.agent_name = filters.agentName;

      const data = await apiCallsAPI.list(projectId, params);
      
      // Apply client-side filtering for date range and status
      let filtered = data;
      
      if (filters.dateFrom || filters.dateTo) {
        filtered = filtered.filter((call: any) => {
          const callDate = new Date(call.created_at);
          if (filters.dateFrom && callDate < new Date(filters.dateFrom)) return false;
          if (filters.dateTo) {
            const toDate = new Date(filters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (callDate > toDate) return false;
          }
          return true;
        });
      }

      if (filters.status && filters.status !== 'all') {
        filtered = filtered.filter((call: any) => {
          if (filters.status === 'success') {
            return call.status_code >= 200 && call.status_code < 300;
          } else {
            return !(call.status_code >= 200 && call.status_code < 300);
          }
        });
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter((call: any) => {
          // Search in request/response data (simplified - in production, search in actual data)
          return JSON.stringify(call).toLowerCase().includes(searchLower);
        });
      }

      // Apply sorting
      filtered.sort((a: any, b: any) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        if (sortField === 'created_at') {
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

      setApiCalls(filtered);
      setTotalItems(filtered.length);
    } catch (error: any) {
      console.error('Failed to load API calls:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load API calls', 'error');
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

  const getStatusBadge = (statusCode: number | null) => {
    if (!statusCode) {
      return <Badge variant="default">Unknown</Badge>;
    }
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge variant="success">Success</Badge>;
    } else if (statusCode >= 400 && statusCode < 500) {
      return <Badge variant="warning">Client Error</Badge>;
    } else {
      return <Badge variant="error">Server Error</Badge>;
    }
  };

  const availableProviders = useMemo(() => {
    const providers = new Set<string>();
    apiCalls.forEach((call) => {
      if (call.provider) providers.add(call.provider);
    });
    return Array.from(providers).sort();
  }, [apiCalls]);

  const availableModels = useMemo(() => {
    const models = new Set<string>();
    apiCalls.forEach((call) => {
      if (call.model) models.add(call.model);
    });
    return Array.from(models).sort();
  }, [apiCalls]);

  const availableAgents = useMemo(() => {
    const agents = new Set<string>();
    apiCalls.forEach((call) => {
      if (call.agent_name) agents.add(call.agent_name);
    });
    return Array.from(agents).sort();
  }, [apiCalls]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (loading && apiCalls.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">API Calls</h1>
          <p className="text-slate-400 mt-2">View and analyze all API calls for this project</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Actions */}
        <div className="flex justify-end mb-6">
          <ExportButton projectId={projectId} filters={filters} />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            onReset={() => setFilters({})}
            availableProviders={availableProviders}
            availableModels={availableModels}
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
                      onClick={() => handleSort('created_at')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Time
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
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('latency_ms')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Latency
                      {sortField === 'latency_ms' ? (
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
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {apiCalls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      No API calls found
                    </td>
                  </tr>
                ) : (
                  apiCalls.map((call) => (
                    <tr key={call.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {new Date(call.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {call.provider}/{call.model}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(call.status_code)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {call.latency_ms ? `${call.latency_ms.toFixed(0)}ms` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {call.request_tokens && call.response_tokens ? (
                          <>
                            {call.request_tokens.toLocaleString()} / {call.response_tokens.toLocaleString()}
                          </>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {call.agent_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => router.push(`/dashboard/${projectId}/api-calls/${call.id}`)}
                          className="text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          View
                        </button>
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

