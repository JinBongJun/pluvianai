'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { ArrowLeft, AlertTriangle, Check, X, Eye, Trash2 } from 'lucide-react';

interface WorstPrompt {
  id: number;
  project_id: number;
  snapshot_id: number | null;
  prompt_text: string;
  reason: string;
  severity_score: number;
  model: string | null;
  provider: string | null;
  is_active: boolean;
  is_reviewed: boolean;
  cluster_id: string | null;
  created_at: string | null;
}

interface WorstPromptStats {
  total: number;
  active: number;
  reviewed: number;
  unreviewed: number;
  by_reason: Record<string, number>;
  avg_severity: number;
}

const REASON_LABELS: Record<string, string> = {
  failure_response: 'Failure Response',
  long_response: 'Long Response',
  hallucination_suspected: 'Hallucination',
  customer_complaint: 'Customer Complaint',
  refusal_increase: 'Refusal',
  json_break: 'JSON Break',
  latency_issue: 'Latency Issue',
  manual_flag: 'Manual Flag',
};

export default function WorstPromptsPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const [prompts, setPrompts] = useState<WorstPrompt[]>([]);
  const [stats, setStats] = useState<WorstPromptStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // Fetch prompts
      const promptsUrl = filter === 'all'
        ? `${baseUrl}/api/v1/projects/${projectId}/worst-prompts`
        : `${baseUrl}/api/v1/projects/${projectId}/worst-prompts?reason=${filter}`;

      const [promptsRes, statsRes] = await Promise.all([
        fetch(promptsUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${baseUrl}/api/v1/projects/${projectId}/worst-prompts/stats`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (promptsRes.ok) {
        const data = await promptsRes.json();
        setPrompts(data);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, projectId]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    void fetchData();
  }, [router, projectId, fetchData]);

  const markAsReviewed = async (promptId: number, keepActive: boolean) => {
    try {
      const token = localStorage.getItem('access_token');
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      await fetch(
        `${baseUrl}/api/v1/projects/${projectId}/worst-prompts/${promptId}/review?keep_active=${keepActive}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      fetchData();
    } catch (error) {
      console.error('Failed to mark as reviewed:', error);
    }
  };

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  const getSeverityBadge = (score: number) => {
    if (score >= 0.8) return <Badge variant="default">Critical</Badge>;
    if (score >= 0.5) return <Badge variant="warning">High</Badge>;
    return <Badge variant="info">Medium</Badge>;
  };

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Worst Prompts' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        <ProjectTabs projectId={projectId} orgId={orgId} />

        <div className="mt-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(basePath)}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Overview
            </Button>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Worst Prompts</h1>
            <p className="text-slate-400">Auto-collected problematic prompts for regression testing</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400 mb-1">Total</p>
              <span className="text-2xl font-bold text-white">
                {loading ? '-' : stats?.total || 0}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400 mb-1">Active</p>
              <span className="text-2xl font-bold text-green-400">
                {loading ? '-' : stats?.active || 0}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400 mb-1">Unreviewed</p>
              <span className="text-2xl font-bold text-yellow-400">
                {loading ? '-' : stats?.unreviewed || 0}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400 mb-1">Avg Severity</p>
              <span className="text-2xl font-bold text-red-400">
                {loading ? '-' : ((stats?.avg_severity || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filter === 'all' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            {Object.entries(REASON_LABELS).map(([key, label]) => (
              <Button
                key={key}
                variant={filter === key ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Prompts List */}
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading...</div>
            ) : prompts.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No worst prompts collected yet.</p>
                <p className="text-sm mt-2">Validate traces in Policy to detect problematic prompts.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {prompts.map((prompt) => (
                  <div key={prompt.id} className="p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getSeverityBadge(prompt.severity_score)}
                          <Badge variant={prompt.is_reviewed ? 'success' : 'warning'}>
                            {prompt.is_reviewed ? 'Reviewed' : 'Unreviewed'}
                          </Badge>
                          <Badge variant="default">
                            {REASON_LABELS[prompt.reason] || prompt.reason}
                          </Badge>
                        </div>
                        <p className="text-white font-mono text-sm truncate">
                          {prompt.prompt_text}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          {prompt.model && <span>Model: {prompt.model}</span>}
                          {prompt.created_at && (
                            <span>{new Date(prompt.created_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!prompt.is_reviewed && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsReviewed(prompt.id, true)}
                              title="Mark as reviewed (keep active)"
                            >
                              <Check className="h-4 w-4 text-green-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsReviewed(prompt.id, false)}
                              title="Mark as reviewed (deactivate)"
                            >
                              <X className="h-4 w-4 text-red-400" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">About Worst Prompts</h2>
            <div className="text-sm text-slate-400 space-y-2">
              <p>Worst prompts are automatically collected when issues are detected:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Failed responses</li>
                <li>Hallucination suspected</li>
                <li>Refusal patterns</li>
                <li>JSON schema breaks</li>
                <li>Latency spikes</li>
              </ul>
              <p className="mt-4">
                Use these prompts as your &quot;golden test set&quot; for regression testing before deployments.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}
