'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, X, Command, Folder, Activity, AlertTriangle, BarChart3, DollarSign, Gauge, Bell, Settings, LayoutDashboard } from 'lucide-react';
import { projectsAPI, apiCallsAPI, driftAPI, alertsAPI } from '@/lib/api';
import { clsx } from 'clsx';

/** Quick navigation items shown when search query is empty or short */
const QUICK_NAV_LABELS: { id: string; label: string; pathSuffix: string; icon: React.ElementType }[] = [
  { id: 'projects', label: 'Projects', pathSuffix: '', icon: Folder },
  { id: 'dashboard', label: 'Dashboard', pathSuffix: '', icon: LayoutDashboard },
  { id: 'api-calls', label: 'API Calls', pathSuffix: '/api-calls', icon: Activity },
  { id: 'drift', label: 'Drift', pathSuffix: '/drift', icon: BarChart3 },
  { id: 'quality', label: 'Quality', pathSuffix: '/quality', icon: Gauge },
  { id: 'cost', label: 'Cost', pathSuffix: '/cost', icon: DollarSign },
  { id: 'alerts', label: 'Alerts', pathSuffix: '/alerts', icon: Bell },
  { id: 'settings', label: 'Settings', pathSuffix: '/settings', icon: Settings },
];

interface SearchResult {
  type: 'project' | 'api_call' | 'drift' | 'alert';
  id: number;
  projectId: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

interface GlobalSearchProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function GlobalSearch({ isOpen: propIsOpen, onClose }: GlobalSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const isOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen;
  const setIsOpen = (val: boolean) => {
    if (onClose && !val) onClose();
    setInternalIsOpen(val);
  };

  const { basePath, projectsHref } = useMemo(() => {
    const orgMatch = pathname?.match(/^\/organizations\/(\d+)\/projects(?:\/(\d+))?/);
    const dashMatch = pathname?.match(/^\/dashboard\/(\d+)/);
    if (orgMatch) {
      const [, orgId, projectId] = orgMatch;
      const projectsHref = `/organizations/${orgId}/projects`;
      const basePath = projectId ? `/organizations/${orgId}/projects/${projectId}` : null;
      return { basePath, projectsHref };
    }
    if (dashMatch) {
      const [, projectId] = dashMatch;
      return { basePath: `/dashboard/${projectId}`, projectsHref: '/organizations' };
    }
    return { basePath: null, projectsHref: '/organizations' };
  }, [pathname]);

  const quickNavItems = useMemo(() => {
    return QUICK_NAV_LABELS.map((item) => {
      let href = projectsHref;
      if (item.id === 'projects') href = projectsHref;
      else if (item.id === 'dashboard') href = basePath || projectsHref;
      else href = basePath ? `${basePath}${item.pathSuffix}` : projectsHref;
      return { ...item, href };
    });
  }, [basePath, projectsHref]);

  useEffect(() => {
    const handleOpenSearch = () => {
      setIsOpen(true);
    };

    window.addEventListener('open-search', handleOpenSearch);
    return () => window.removeEventListener('open-search', handleOpenSearch);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const search = async () => {
      setLoading(true);
      try {
        const searchLower = query.toLowerCase();
        const allResults: SearchResult[] = [];

        // Search projects
        try {
          const projects = await projectsAPI.list(query);
          projects.forEach((project: any) => {
            if (project.name.toLowerCase().includes(searchLower) ||
                (project.description && project.description.toLowerCase().includes(searchLower))) {
              allResults.push({
                type: 'project',
                id: project.id,
                projectId: project.id,
                title: project.name,
                subtitle: project.description || 'Project',
                icon: <Folder className="h-4 w-4" />,
              });
            }
          });
        } catch (error) {
          // Ignore errors
        }

        // Search API calls (limited to recent)
        try {
          // Get all projects first
          const projects = await projectsAPI.list();
          for (const project of projects.slice(0, 5)) { // Limit to 5 projects
            try {
              const calls = await apiCallsAPI.list(project.id, { limit: 20 });
              calls.forEach((call: any) => {
                const callStr = JSON.stringify(call).toLowerCase();
                if (callStr.includes(searchLower)) {
                  allResults.push({
                    type: 'api_call',
                    id: call.id,
                    projectId: project.id,
                    title: `${call.provider}/${call.model}`,
                    subtitle: new Date(call.created_at).toLocaleString(),
                    icon: <Activity className="h-4 w-4" />,
                  });
                }
              });
            } catch (error) {
              // Ignore errors
            }
          }
        } catch (error) {
          // Ignore errors
        }

        // Search drift detections
        try {
          const projects = await projectsAPI.list();
          for (const project of projects.slice(0, 3)) {
            try {
              const drifts = await driftAPI.list(project.id, { limit: 10 });
              drifts.forEach((drift: any) => {
                if (drift.detection_type.toLowerCase().includes(searchLower) ||
                    (drift.agent_name && drift.agent_name.toLowerCase().includes(searchLower))) {
                  allResults.push({
                    type: 'drift',
                    id: drift.id,
                    projectId: project.id,
                    title: `${drift.detection_type} drift`,
                    subtitle: `Severity: ${drift.severity}`,
                    icon: <AlertTriangle className="h-4 w-4" />,
                  });
                }
              });
            } catch (error) {
              // Ignore errors
            }
          }
        } catch (error) {
          // Ignore errors
        }

        setResults(allResults.slice(0, 20)); // Limit to 20 results
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(search, 300); // Debounce
    return () => clearTimeout(timeout);
  }, [query]);

  const showQuickNav = query.length < 2;
  const quickNavOrResultsLength = showQuickNav ? quickNavItems.length : results.length;

  useEffect(() => {
    setSelectedIndex(0);
  }, [showQuickNav, query]);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
          setQuery('');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, quickNavOrResultsLength - 1)));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          if (showQuickNav && quickNavItems[selectedIndex]) {
            e.preventDefault();
            router.push(quickNavItems[selectedIndex].href);
            setIsOpen(false);
            setQuery('');
          } else if (!showQuickNav && results[selectedIndex]) {
            e.preventDefault();
            handleResultClick(results[selectedIndex]);
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, results, selectedIndex, showQuickNav, quickNavItems, quickNavOrResultsLength]);

  const handleResultClick = async (result: SearchResult) => {
    try {
      const { projectsAPI } = await import('@/lib/api');
      const proj = await projectsAPI.get(result.projectId);
      const orgId = proj.organization_id;
      
      if (orgId) {
        switch (result.type) {
          case 'project':
            router.push(`/organizations/${orgId}/projects/${result.projectId}`);
            break;
          case 'api_call':
            router.push(`/organizations/${orgId}/projects/${result.projectId}/api-calls/${result.id}`);
            break;
          case 'drift':
            router.push(`/organizations/${orgId}/projects/${result.projectId}/drift/${result.id}`);
            break;
          case 'alert':
            router.push(`/organizations/${orgId}/projects/${result.projectId}/alerts/${result.id}`);
            break;
        }
      } else {
        // Fallback to old paths
        switch (result.type) {
          case 'project':
            router.push(`/dashboard/${result.projectId}`);
            break;
          case 'api_call':
            router.push(`/dashboard/${result.projectId}/api-calls/${result.id}`);
            break;
          case 'drift':
            router.push(`/dashboard/${result.projectId}/drift/${result.id}`);
            break;
          case 'alert':
            router.push(`/dashboard/${result.projectId}/alerts/${result.id}`);
            break;
        }
      }
    } catch {
      // Fallback to old paths on error
      switch (result.type) {
        case 'project':
          router.push(`/dashboard/${result.projectId}`);
          break;
        case 'api_call':
          router.push(`/dashboard/${result.projectId}/api-calls/${result.id}`);
          break;
        case 'drift':
          router.push(`/dashboard/${result.projectId}/drift/${result.id}`);
          break;
        case 'alert':
          router.push(`/dashboard/${result.projectId}/alerts/${result.id}`);
          break;
      }
    }
    setIsOpen(false);
    setQuery('');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsOpen(false);
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-ag-surface border border-white/10 rounded-lg shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <Search className="h-5 w-5 text-ag-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Find..."
            className="flex-1 bg-transparent outline-none text-ag-text placeholder-ag-muted"
          />
          <div className="flex items-center gap-2 text-xs text-ag-muted">
            <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded">Esc</kbd>
            <span>to close</span>
          </div>
        </div>

        {/* Quick nav (when query empty/short) or search results */}
        <div className="max-h-96 overflow-y-auto">
          {showQuickNav ? (
            <div className="py-2">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ag-muted">
                Quick navigation
              </div>
              <div className="divide-y divide-white/5">
                {quickNavItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        router.push(item.href);
                        setIsOpen(false);
                        setQuery('');
                      }}
                      className={clsx(
                        'w-full flex items-center gap-3 p-3 px-4 text-left transition-colors',
                        index === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'
                      )}
                    >
                      <div className="text-ag-muted">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-ag-text">{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-3 mt-2 border-t border-white/5 text-xs text-ag-muted">
                Type to search projects, API calls, and drift detections
              </div>
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-ag-muted">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-ag-muted">
              <p>No results found</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className={clsx(
                    'w-full flex items-center gap-3 p-4 text-left transition-colors',
                    index === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'
                  )}
                >
                  <div className="text-ag-muted">{result.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ag-text">{result.title}</div>
                    <div className="text-sm text-ag-muted truncate">{result.subtitle}</div>
                  </div>
                  <div className="text-xs text-ag-muted uppercase tracking-wider">{result.type.replace('_', ' ')}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {(showQuickNav || results.length > 0) && (
          <div className="p-3 border-t border-white/10 text-xs text-ag-muted text-center">
            Use arrow keys to navigate, Enter to select
          </div>
        )}
      </div>
    </div>
  );
}

