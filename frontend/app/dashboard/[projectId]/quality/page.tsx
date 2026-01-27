'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { projectsAPI, organizationsAPI } from '@/lib/api';
import OrgLayout from '@/components/layout/OrgLayout';
import useSWR from 'swr';
import FilterPanel, { FilterState } from '@/components/filters/FilterPanel';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { qualityAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';

type SortField = 'created_at' | 'overall_score' | 'semantic_consistency_score';
type SortDirection = 'asc' | 'desc';

interface QualityScore {
  id: number;
  api_call_id: number;
  project_id: number;
  overall_score: number;
  semantic_consistency_score: number | null;
  tone_score: number | null;
  coherence_score: number | null;
  json_valid: boolean | null;
  required_fields_present: boolean | null;
  evaluation_details: any;
  created_at: string;
}

export default function QualityScoresPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);
  const [orgId, setOrgId] = useState<number | string | null>(null);

  const [scores, setScores] = useState<QualityScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return date;
    })(),
    to: new Date(),
  });

  // Get project's organization_id
  const { data: project } = useSWR(projectId ? ['project', projectId] : null, () =>
    projectsAPI.get(projectId),
  );

  useEffect(() => {
    if (project?.organization_id) {
      setOrgId(project.organization_id);
    } else if (project && !project.organization_id) {
      router.push('/organizations');
      return;
    }
  }, [project, router]);

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId!, { includeStats: false }),
  );

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    if (!orgId) {
      return; // Wait for orgId
    }

    loadQualityScores();
  }, [projectId, filters, sortField, sortDirection, currentPage, itemsPerPage, dateRange, orgId, router]);

  const loadQualityScores = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: Math.min(itemsPerPage * 10, 1000), // Max 1000 per backend validation
        offset: 0,
      };

      const data = await qualityAPI.getScores(projectId, params);
      
      // Ensure data is an array
      const scores: QualityScore[] = Array.isArray(data) ? (data as unknown as QualityScore[]) : [];
      
      // Apply client-side filtering
      let filtered = scores;
      
      // Date range filter
      if (dateRange.from || dateRange.to) {
        filtered = filtered.filter((score: QualityScore) => {
          const scoreDate = new Date(score.created_at);
          if (dateRange.from && scoreDate < dateRange.from) return false;
          if (dateRange.to) {
            const toDate = new Date(dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (scoreDate > toDate) return false;
          }
          return true;
        });
      }

      // Score range filter (via search in filters)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter((score: QualityScore) => {
          const scoreStr = score.overall_score.toString();
          return scoreStr.includes(searchLower);
        });
      }

      // Score range filter (use status filter for score ranges)
      // Note: This uses the status filter, but interprets it as score ranges
      // 'success' = high (≥90), 'error' = low (<70), 'all' = all scores
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'success') {
          filtered = filtered.filter((score: QualityScore) => score.overall_score >= 90);
        } else if (filters.status === 'error') {
          filtered = filtered.filter((score: QualityScore) => score.overall_score < 70);
        }
      }

      // Apply sorting
      filtered.sort((a: QualityScore, b: QualityScore) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

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

      // Apply pagination
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginated = filtered.slice(startIndex, endIndex);

      setScores(paginated);
      setTotalItems(filtered.length);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load quality scores:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to load quality scores', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const [totalItems, setTotalItems] = useState(0);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) {
      return <Badge variant="success">Excellent</Badge>;
    } else if (score >= 70) {
      return <Badge variant="warning">Good</Badge>;
    } else {
      return <Badge variant="error">Poor</Badge>;
    }
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#000314]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500/20 border-t-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (loading && scores.length === 0) {
    return (
      <OrgLayout
        orgId={orgId}
        breadcrumb={[
          { label: 'Organizations', href: '/organizations' },
          { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
          { label: 'Quality Analysis' },
        ]}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 border-t-transparent"></div>
        </div>
      </OrgLayout>
    );
  }

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Quality Analysis' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">Quality Scores</h1>
          <p className="text-slate-400 mt-2">View and analyze quality evaluation results</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} orgId={orgId} />

        {/* Date Range Selector */}
        <div className="mb-6">
          <DateRangePicker value={dateRange} onChange={setDateRange} showPeriodLabel={false} />
        </div>

        {/* Filters */}
        <div className="mb-6">
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            onReset={() => setFilters({})}
            availableProviders={[]}
            availableModels={[]}
            availableAgents={[]}
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
                    <button
                      onClick={() => handleSort('overall_score')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Overall Score
                      {sortField === 'overall_score' ? (
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
                    Semantic
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Tone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Coherence
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Validation
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {scores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      No quality scores found
                    </td>
                  </tr>
                ) : (
                  scores.map((score) => (
                    <tr key={score.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {new Date(score.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            'text-2xl font-bold font-mono',
                            score.overall_score >= 90 ? 'text-emerald-400' :
                            score.overall_score >= 70 ? 'text-yellow-400' :
                            'text-red-400'
                          )}>
                            {toFixedSafe(score.overall_score, 1)}
                          </span>
                          {getScoreBadge(score.overall_score)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {score.semantic_consistency_score !== null ? (
                          `${toFixedSafe(score.semantic_consistency_score, 1)}`
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {score.tone_score !== null ? (
                          `${toFixedSafe(score.tone_score, 1)}`
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {score.coherence_score !== null ? (
                          `${toFixedSafe(score.coherence_score, 1)}`
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {score.json_valid !== null && (
                            <span className={clsx(
                              'text-xs px-2 py-1 rounded',
                              score.json_valid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            )}>
                              JSON
                            </span>
                          )}
                          {score.required_fields_present !== null && (
                            <span className={clsx(
                              'text-xs px-2 py-1 rounded',
                              score.required_fields_present ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            )}>
                              Fields
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (orgId) {
                                router.push(`/organizations/${orgId}/projects/${projectId}/api-calls/${score.api_call_id}`);
                              } else {
                                router.push(`/dashboard/${projectId}/api-calls/${score.api_call_id}`);
                              }
                            }}
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
    </OrgLayout>
  );
}
