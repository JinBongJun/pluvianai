'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Command, Folder, Activity, AlertTriangle } from 'lucide-react';
import { projectsAPI, apiCallsAPI, driftAPI, alertsAPI } from '@/lib/api';
import { clsx } from 'clsx';

interface SearchResult {
  type: 'project' | 'api_call' | 'drift' | 'alert';
  id: number;
  projectId: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
          setQuery('');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
          e.preventDefault();
          handleResultClick(results[selectedIndex]);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, results, selectedIndex]);

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
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsOpen(false);
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search projects, API calls, drift detections..."
            className="flex-1 outline-none text-gray-900 placeholder-gray-400"
          />
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <kbd className="px-2 py-1 bg-gray-100 rounded">Esc</kbd>
            <span>to close</span>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Searching...</div>
          ) : query.length < 2 ? (
            <div className="p-8 text-center text-gray-500">
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p>Type at least 2 characters to search</p>
              <div className="mt-4 text-xs text-gray-400 space-y-1">
                <div>Search across projects, API calls, and drift detections</div>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No results found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className={clsx(
                    'w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors',
                    index === selectedIndex && 'bg-gray-50'
                  )}
                >
                  <div className="text-gray-400">{result.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{result.title}</div>
                    <div className="text-sm text-gray-600 truncate">{result.subtitle}</div>
                  </div>
                  <div className="text-xs text-gray-400 capitalize">{result.type.replace('_', ' ')}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="p-3 border-t border-gray-200 text-xs text-gray-500 text-center">
            Use arrow keys to navigate, Enter to select
          </div>
        )}
      </div>
    </div>
  );
}

