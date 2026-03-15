"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import ProjectLayout from "@/components/layout/ProjectLayout";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import FilterPanel, { FilterState } from "@/components/filters/FilterPanel";
import Pagination from "@/components/ui/Pagination";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { apiCallsAPI, organizationsAPI } from "@/lib/api";
import { toFixedSafe } from "@/lib/format";
import { useToast } from "@/components/ToastContainer";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import ExportButton from "@/components/export/ExportButton";
import PulseIndicator from "@/components/streaming/PulseIndicator";
import LiveStreamView from "@/components/streaming/LiveStreamView";
import { clsx } from "clsx";
import ProjectTabs from "@/components/ProjectTabs";
import useSWR from "swr";

type SortField = "created_at" | "latency_ms" | "status_code" | "provider" | "model";
type SortDirection = "asc" | "desc";

export default function APICallsListPage() {
  const router = useRouter();
  const toast = useToast();
  const { orgId, projectId } = useOrgProjectParams();

  const { data: org } = useSWR(orgId ? ["organization", orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: false })
  );

  const [apiCalls, setApiCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [searchInput, setSearchInput] = useState(""); // Local search input state
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [allData, setAllData] = useState<any[]>([]); // Store all fetched data for client-side filtering

  const loadAPICalls = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch more data if client-side filters are active (date range, status, search)
      // Otherwise use server-side pagination
      // Note: Backend max limit is 1000, so we can't fetch all data at once
      const needsClientSideFiltering = !!(
        filters.dateFrom ||
        filters.dateTo ||
        filters.status ||
        filters.search
      );
      const fetchLimit = needsClientSideFiltering ? 1000 : itemsPerPage; // Max 1000 per backend validation
      const fetchOffset = needsClientSideFiltering ? 0 : (currentPage - 1) * itemsPerPage;

      const params: any = {
        limit: fetchLimit,
        offset: fetchOffset,
      };

      if (filters.provider) params.provider = filters.provider;
      if (filters.model) params.model = filters.model;
      if (filters.agentName) params.agent_name = filters.agentName;

      const data = await apiCallsAPI.list(projectId, params);

      // Store all data for client-side filtering
      if (needsClientSideFiltering) {
        setAllData(data);
      } else {
        setAllData([]); // Clear when using server-side pagination
      }

      // Apply client-side filtering for date range, status, and search
      let filtered = needsClientSideFiltering ? data : [...data];

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

      if (filters.status && filters.status !== "all") {
        filtered = filtered.filter((call: any) => {
          if (filters.status === "success") {
            return call.status_code >= 200 && call.status_code < 300;
          } else {
            return !(call.status_code >= 200 && call.status_code < 300);
          }
        });
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter((call: any) => {
          // Search in relevant fields only (more efficient and accurate)
          return (
            call.provider?.toLowerCase().includes(searchLower) ||
            call.model?.toLowerCase().includes(searchLower) ||
            call.agent_name?.toLowerCase().includes(searchLower) ||
            call.chain_id?.toLowerCase().includes(searchLower) ||
            (call.request_prompt && call.request_prompt.toLowerCase().includes(searchLower)) ||
            (call.response_text && call.response_text.toLowerCase().includes(searchLower)) ||
            call.status_code?.toString().includes(searchLower)
          );
        });
      }

      // Apply sorting
      filtered.sort((a: any, b: any) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

        if (sortField === "created_at") {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        } else if (sortField === "provider" || sortField === "model") {
          // String comparison for provider and model
          aVal = aVal?.toLowerCase() || "";
          bVal = bVal?.toLowerCase() || "";
        }

        if (aVal === null || aVal === undefined || aVal === "") return 1;
        if (bVal === null || bVal === undefined || bVal === "") return -1;

        if (sortDirection === "asc") {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });

      // Paginate filtered results if client-side filtering was applied
      const paginatedResults = needsClientSideFiltering
        ? filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
        : filtered;

      setApiCalls(paginatedResults);
      setTotalItems(filtered.length); // Total filtered count for pagination
    } catch (error: any) {
      console.error("Failed to load API calls:", error);
      const errMsg =
        error.response?.data?.error?.message ??
        error.response?.data?.detail ??
        "Failed to load API calls";
      toast.showToast(typeof errMsg === "string" ? errMsg : "Failed to load API calls", "error");
      if (error.response?.status === 401) {
        router.push("/login");
      } else if (
        error.response?.status === 404 &&
        (errMsg === "Project not found" || errMsg === "Not Found")
      ) {
        if (orgId) router.push(`/organizations/${orgId}/projects`);
        else router.push("/organizations");
      }
      // Set empty arrays on error
      setApiCalls([]);
      setAllData([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    filters,
    itemsPerPage,
    orgId,
    projectId,
    sortDirection,
    sortField,
    toast,
    router,
  ]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    if (!projectId || isNaN(projectId) || projectId <= 0) {
      if (orgId) {
        router.push(`/organizations/${orgId}/projects`);
      } else {
        router.push("/organizations");
      }
      return;
    }

    loadAPICalls();
  }, [projectId, orgId, router, loadAPICalls]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Apply search - called on Enter key or button click
  const applySearch = () => {
    const trimmedSearch = searchInput.trim();
    if (trimmedSearch !== (filters.search || "")) {
      setFilters({ ...filters, search: trimmedSearch || undefined });
      setCurrentPage(1);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchInput("");
    setFilters({ ...filters, search: undefined });
    setCurrentPage(1);
  };

  // Handle Enter key press in search
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applySearch();
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

  // Extract available options from all fetched data, not just current page
  const availableProviders = useMemo(() => {
    const providers = new Set<string>();
    (allData.length > 0 ? allData : apiCalls).forEach(call => {
      if (call.provider) providers.add(call.provider);
    });
    return Array.from(providers).sort();
  }, [allData, apiCalls]);

  const availableModels = useMemo(() => {
    const models = new Set<string>();
    (allData.length > 0 ? allData : apiCalls).forEach(call => {
      if (call.model) models.add(call.model);
    });
    return Array.from(models).sort();
  }, [allData, apiCalls]);

  const availableAgents = useMemo(() => {
    const agents = new Set<string>();
    (allData.length > 0 ? allData : apiCalls).forEach(call => {
      if (call.agent_name) agents.add(call.agent_name);
    });
    return Array.from(agents).sort();
  }, [allData, apiCalls]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (!orgId) {
    return null;
  }

  if (loading && apiCalls.length === 0) {
    return (
      <ProjectLayout
        orgId={orgId}
        projectId={projectId}
        breadcrumb={[
          { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
          { label: "API Calls" },
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
        { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
        { label: "API Calls" },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">API Calls</h1>
          <p className="text-slate-400 mt-2">View and analyze all API calls for this project</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} orgId={orgId} />

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadAPICalls}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <PulseIndicator projectId={projectId} show5m />
          </div>
          <ExportButton projectId={projectId} filters={filters} />
        </div>

        {/* Live stream */}
        <div className="mb-6">
          <LiveStreamView projectId={projectId} limit={20} linkToCalls={false} />
        </div>

        {/* Filters */}
        <div className="mb-4">
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={() => {
              setFilters({});
              setSearchInput(""); // Also clear search input
              setCurrentPage(1);
            }}
            availableProviders={availableProviders}
            availableModels={availableModels}
            availableAgents={availableAgents}
          />
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search in prompts and responses... (Press Enter)"
                className="w-full pl-10 pr-10 py-2.5 bg-[#1e293b] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-ag-accent focus:border-ag-accent transition-colors"
              />
              {searchInput && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant="primary" size="sm" onClick={applySearch} className="px-4 shrink-0">
              Search
            </Button>
          </div>
          {filters.search && (
            <p className="text-xs text-ag-accent mt-2">
              Showing results for: &quot;{filters.search}&quot;
            </p>
          )}
        </div>

        {/* Table */}
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl">
          {/* Loading indicator - shows on top of table without hiding content */}
          {loading && apiCalls.length > 0 && (
            <div className="absolute top-0 left-0 right-0 z-10">
              <div className="h-1 bg-ag-accent/20 overflow-hidden">
                <div
                  className="h-full w-1/3 bg-ag-accent animate-[slide_1s_ease-in-out_infinite]"
                  style={{ animation: "slide 1s ease-in-out infinite" }}
                />
              </div>
            </div>
          )}
          <div
            className={clsx(
              "overflow-x-auto transition-opacity duration-200",
              loading && apiCalls.length > 0 && "opacity-60"
            )}
          >
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort("created_at")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Time
                      {sortField === "created_at" ? (
                        sortDirection === "asc" ? (
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
                      onClick={() => handleSort("provider")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Provider
                      {sortField === "provider" ? (
                        sortDirection === "asc" ? (
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
                      onClick={() => handleSort("model")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Model
                      {sortField === "model" ? (
                        sortDirection === "asc" ? (
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
                    <button
                      onClick={() => handleSort("latency_ms")}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      Latency
                      {sortField === "latency_ms" ? (
                        sortDirection === "asc" ? (
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
                {/* Initial loading state - show skeleton rows */}
                {loading && apiCalls.length === 0 ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={`skeleton-${i}`} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="h-4 bg-white/10 rounded w-24"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-white/10 rounded w-16"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-white/10 rounded w-20"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-6 bg-white/10 rounded w-12"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-white/10 rounded w-16"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-white/10 rounded w-14"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-white/10 rounded w-20"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-white/10 rounded w-8 ml-auto"></div>
                      </td>
                    </tr>
                  ))
                ) : apiCalls.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      {filters.search ||
                      filters.dateFrom ||
                      filters.dateTo ||
                      filters.status ||
                      filters.provider ||
                      filters.model ||
                      filters.agentName ? (
                        <div>
                          <p>No API calls found matching the current filters.</p>
                          <p className="text-sm mt-2 text-slate-500">
                            {filters.search && `Search: "${filters.search}"`}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFilters({});
                              setCurrentPage(1);
                            }}
                            className="mt-4"
                          >
                            Clear Filters
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <p>No API calls found for this project.</p>
                          <p className="text-sm mt-2 text-slate-500">
                            Start making API calls to see them here.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  apiCalls.map(call => (
                    <tr key={call.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {new Date(call.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {call.provider || "unknown"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {call.model || "unknown"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(call.status_code)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {call.latency_ms ? `${toFixedSafe(call.latency_ms, 0)}ms` : "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {call.request_tokens && call.response_tokens ? (
                          <>
                            {call.request_tokens.toLocaleString()} /{" "}
                            {call.response_tokens.toLocaleString()}
                          </>
                        ) : (
                          "N/A"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {call.agent_name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() =>
                            router.push(
                              `/organizations/${orgId}/projects/${projectId}/api-calls/${call.id}`
                            )
                          }
                          className="text-ag-accent hover:text-ag-accentLight transition-colors"
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
          <div className="mt-6">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={newItemsPerPage => {
                setItemsPerPage(newItemsPerPage);
                setCurrentPage(1); // Reset to first page when changing items per page
              }}
              className="bg-transparent"
            />
          </div>
        )}

        {/* Show info when client-side filtering is applied */}
        {(filters.dateFrom || filters.dateTo || filters.status || filters.search) &&
          totalItems > 0 && (
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400">
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} to{" "}
                {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} filtered results
              </p>
            </div>
          )}
      </div>
    </ProjectLayout>
  );
}
