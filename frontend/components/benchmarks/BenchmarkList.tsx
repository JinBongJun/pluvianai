'use client';

import { useEffect, useState } from 'react';
import { publicBenchmarksAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, Eye } from 'lucide-react';

interface Benchmark {
  id: number;
  author_id: number | null;
  name: string;
  description: string | null;
  benchmark_type: string;
  benchmark_data: any;
  test_cases_count: number;
  category: string | null;
  tags: string[];
  is_featured: boolean;
  is_approved: boolean;
  view_count: number;
  created_at: string;
}

interface BenchmarkListProps {
  onBenchmarkSelect?: (benchmark: Benchmark) => void;
}

export default function BenchmarkList({ onBenchmarkSelect }: BenchmarkListProps) {
  const router = useRouter();
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [benchmarkType, setBenchmarkType] = useState<string>('');
  const [sort, setSort] = useState<'recent' | 'popular' | 'featured'>('recent');

  useEffect(() => {
    loadBenchmarks();
  }, [category, benchmarkType, sort, search]);

  const loadBenchmarks = async () => {
    try {
      setLoading(true);
      const data = await publicBenchmarksAPI.list({
        category: category || undefined,
        benchmark_type: benchmarkType || undefined,
        search: search || undefined,
        sort,
        limit: 50,
      });
      setBenchmarks(Array.isArray(data) ? data : []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load benchmarks:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBenchmarkClick = (benchmark: Benchmark) => {
    if (onBenchmarkSelect) {
      onBenchmarkSelect(benchmark);
    } else {
      router.push(`/benchmarks/${benchmark.id}`);
    }
  };

  const formatBenchmarkData = (data: any) => {
    if (!data || typeof data !== 'object') return 'N/A';
    
    // Try to extract model names or keys
    if (Array.isArray(data)) {
      return `${data.length} models`;
    }
    
    const keys = Object.keys(data);
    if (keys.length > 0) {
      return `${keys.length} models: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`;
    }
    
    return 'N/A';
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search benchmarks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Categories</option>
            <option value="nlp">NLP</option>
            <option value="code">Code</option>
            <option value="translation">Translation</option>
          </select>

          {/* Benchmark Type */}
          <select
            value={benchmarkType}
            onChange={(e) => setBenchmarkType(e.target.value)}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Types</option>
            <option value="model_comparison">Model Comparison</option>
            <option value="task_performance">Task Performance</option>
          </select>
        </div>

        {/* Sort */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-slate-400">Sort by:</span>
          <div className="flex gap-2">
            {(['recent', 'popular', 'featured'] as const).map((sortOption) => (
              <button
                key={sortOption}
                onClick={() => setSort(sortOption)}
                className={`px-3 py-1 text-sm rounded ${
                  sort === sortOption
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {sortOption.charAt(0).toUpperCase() + sortOption.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Benchmarks List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-slate-700 rounded w-full mb-4"></div>
              <div className="h-3 bg-slate-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : benchmarks.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p>No benchmarks found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {benchmarks.map((benchmark) => (
            <div
              key={benchmark.id}
              className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-purple-500/50 cursor-pointer transition-colors"
              onClick={() => handleBenchmarkClick(benchmark)}
            >
              {benchmark.is_featured && (
                <div className="mb-2">
                  <span className="inline-block px-2 py-1 text-xs bg-purple-600 text-white rounded">
                    Featured
                  </span>
                </div>
              )}

              <h3 className="text-lg font-semibold text-white mb-2">{benchmark.name}</h3>
              
              {benchmark.description && (
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">{benchmark.description}</p>
              )}

              <div className="flex items-center gap-4 mb-3 text-sm text-slate-400">
                <span className="capitalize">{benchmark.benchmark_type.replace('_', ' ')}</span>
                {benchmark.category && (
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs">{benchmark.category}</span>
                )}
              </div>

              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">Models:</p>
                <p className="text-sm text-slate-300">{formatBenchmarkData(benchmark.benchmark_data)}</p>
                <p className="text-xs text-slate-500 mt-1">{benchmark.test_cases_count} test cases</p>
              </div>

              {benchmark.tags && benchmark.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {benchmark.tags.slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Eye className="w-4 h-4" />
                  <span>{benchmark.view_count} views</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(benchmark.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
