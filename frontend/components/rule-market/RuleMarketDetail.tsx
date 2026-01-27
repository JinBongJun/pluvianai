'use client';

import { useEffect, useState } from 'react';
import { ruleMarketAPI, projectsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Star, Download, Tag, User } from 'lucide-react';
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

interface RuleMarketDetailProps {
  ruleId: number;
  onDownload?: (ruleId: number, projectId: number) => void;
}

export default function RuleMarketDetail({ ruleId, onDownload }: RuleMarketDetailProps) {
  const [rule, setRule] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadRule();
    loadProjects();
  }, [ruleId]);

  const loadRule = async () => {
    try {
      setLoading(true);
      const data = await ruleMarketAPI.get(ruleId);
      setRule(data);
      setRating(data.rating);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load rule:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { ruleId } });
        });
      }
      toast.error('Failed to load rule');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const data = await projectsAPI.list();
      setProjects(Array.isArray(data) ? data : []);
      if (data.length > 0) {
        setSelectedProjectId(data[0].id);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load projects:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
    }
  };

  const handleDownload = async () => {
    if (!selectedProjectId) {
      toast.error('Please select a project');
      return;
    }

    try {
      setDownloading(true);
      await ruleMarketAPI.download(ruleId, selectedProjectId);
      toast.success('Rule downloaded successfully');
      
      if (onDownload) {
        onDownload(ruleId, selectedProjectId);
      }
      
      // Reload rule to update download count
      loadRule();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to download rule:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { ruleId, projectId } });
        });
      }
      toast.error(error.response?.data?.detail || 'Failed to download rule');
    } finally {
      setDownloading(false);
    }
  };

  const handleRate = async (newRating: number) => {
    try {
      setUserRating(newRating);
      const updated = await ruleMarketAPI.rate(ruleId, newRating);
      setRating(updated.rating);
      toast.success('Rating submitted');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to rate rule:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { ruleId } });
        });
      }
      toast.error('Failed to submit rating');
      setUserRating(null);
    }
  };

  const renderStars = (value: number, interactive: boolean = false) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <button
          key={i}
          onClick={() => interactive && handleRate(i)}
          disabled={!interactive}
          className={`${
            interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'
          } ${i <= value ? 'text-yellow-400' : 'text-slate-600'}`}
        >
          <Star className={`w-5 h-5 ${i <= value ? 'fill-current' : ''}`} />
        </button>
      );
    }
    return stars;
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/2"></div>
          <div className="h-4 bg-slate-700 rounded w-full"></div>
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <p className="text-slate-400">Rule not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {rule.is_featured && (
              <span className="inline-block px-2 py-1 text-xs bg-purple-600 text-white rounded mb-2">
                Featured
              </span>
            )}
            <h1 className="text-2xl font-bold text-white mb-2">{rule.name}</h1>
            {rule.description && (
              <p className="text-slate-400 mb-4">{rule.description}</p>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <span className="text-sm text-slate-400">Type</span>
            <p className="text-white font-medium capitalize">{rule.rule_type}</p>
          </div>
          {rule.category && (
            <div>
              <span className="text-sm text-slate-400">Category</span>
              <p className="text-white font-medium capitalize">{rule.category}</p>
            </div>
          )}
          <div>
            <span className="text-sm text-slate-400">Pattern Type</span>
            <p className="text-white font-medium capitalize">{rule.pattern_type}</p>
          </div>
          <div>
            <span className="text-sm text-slate-400">Downloads</span>
            <p className="text-white font-medium">{rule.download_count}</p>
          </div>
        </div>

        {/* Tags */}
        {rule.tags && rule.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {rule.tags.map((tag, idx) => (
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

        {/* Rating */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {renderStars(rating || 0)}
            </div>
            <span className="text-sm text-slate-400">
              {rating?.toFixed(1)} ({rule.rating_count} ratings)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-slate-400">Rate:</span>
            {renderStars(userRating || 0, true)}
          </div>
        </div>
      </div>

      {/* Pattern Preview */}
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <h2 className="text-lg font-semibold text-white mb-4">Pattern</h2>
        <pre className="bg-slate-900 p-4 rounded border border-slate-700 overflow-x-auto">
          <code className="text-sm text-slate-300">{rule.pattern}</code>
        </pre>
      </div>

      {/* Download Section */}
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <h2 className="text-lg font-semibold text-white mb-4">Download to Project</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select Project
            </label>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleDownload}
            disabled={downloading || !selectedProjectId}
            variant="primary"
            className="w-full"
          >
            {downloading ? (
              'Downloading...'
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Rule
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
