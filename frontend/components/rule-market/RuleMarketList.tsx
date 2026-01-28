'use client';

import { useEffect, useState } from 'react';
import { ruleMarketAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Search, Star, Download, Tag } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Rule {
  id: number;
  author_id: number;
  name: string;
  description: string | null;
  rule_type: string;
  pattern: string;
  pattern_type: string;
  category: string | null;
  tags: string[];
  download_count: number;
  rating: number;
  rating_count: number;
  is_approved: boolean;
  is_featured: boolean;
  created_at: string;
}

interface RuleMarketListProps {
  onRuleSelect?: (rule: Rule) => void;
}

export default function RuleMarketList({ onRuleSelect }: RuleMarketListProps) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [ruleType, setRuleType] = useState<string>('');
  const [sort, setSort] = useState<'popular' | 'recent' | 'rating'>('popular');

  useEffect(() => {
    loadRules();
  }, [category, ruleType, sort, search]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await ruleMarketAPI.list({
        category: category || undefined,
        rule_type: ruleType || undefined,
        search: search || undefined,
        sort,
        limit: 50,
      });
      setRules(Array.isArray(data) ? data : []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load rules:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRuleClick = (rule: Rule) => {
    if (onRuleSelect) {
      onRuleSelect(rule);
    } else {
      router.push(`/rule-market/${rule.id}`);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<Star key={i} className="w-4 h-4 fill-yellow-400/50 text-yellow-400" />);
      } else {
        stars.push(<Star key={i} className="w-4 h-4 text-slate-600" />);
      }
    }
    return stars;
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
                placeholder="Search rules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-ag-surface border border-white/10 rounded text-ag-text placeholder-ag-muted focus:outline-none focus:ring-2 focus:ring-ag-accent"
              />
            </div>
          </div>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 bg-ag-surface border border-white/10 rounded text-ag-text focus:outline-none focus:ring-2 focus:ring-ag-accent"
          >
            <option value="">All Categories</option>
            <option value="security">Security</option>
            <option value="quality">Quality</option>
            <option value="compliance">Compliance</option>
          </select>

          {/* Rule Type */}
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value)}
            className="px-3 py-2 bg-ag-surface border border-white/10 rounded text-ag-text focus:outline-none focus:ring-2 focus:ring-ag-accent"
          >
            <option value="">All Types</option>
            <option value="pii">PII</option>
            <option value="toxicity">Toxicity</option>
            <option value="hallucination">Hallucination</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* Sort */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-slate-400">Sort by:</span>
          <div className="flex gap-2">
            {(['popular', 'recent', 'rating'] as const).map((sortOption) => (
              <button
                key={sortOption}
                onClick={() => setSort(sortOption)}
                className={`px-3 py-1 text-sm rounded ${
                  sort === sortOption
                    ? 'bg-ag-primary text-ag-accent-light'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {sortOption.charAt(0).toUpperCase() + sortOption.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rules List */}
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
      ) : rules.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p>No rules found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-ag-accent/50 cursor-pointer transition-colors"
              onClick={() => handleRuleClick(rule)}
            >
              {rule.is_featured && (
                <div className="mb-2">
                  <span className="inline-block px-2 py-1 text-xs bg-ag-primary text-ag-accent-light rounded">
                    Featured
                  </span>
                </div>
              )}

              <h3 className="text-lg font-semibold text-white mb-2">{rule.name}</h3>
              
              {rule.description && (
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">{rule.description}</p>
              )}

              <div className="flex items-center gap-4 mb-3 text-sm text-slate-400">
                <span className="capitalize">{rule.rule_type}</span>
                {rule.category && (
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs">{rule.category}</span>
                )}
              </div>

              {rule.tags && rule.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {rule.tags.slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {renderStars(rule.rating)}
                  </div>
                  <span className="text-xs text-slate-400">
                    ({rule.rating_count})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Download className="w-4 h-4" />
                  <span>{rule.download_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
