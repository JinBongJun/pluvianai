'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { ArrowLeft, CheckCircle, XCircle, MessageSquare, Clock, User } from 'lucide-react';

interface Review {
  id: number;
  project_id: number;
  replay_id: number | null;
  title: string;
  description: string | null;
  status: string;
  regression_status: string;
  signals_detected: Record<string, unknown> | null;
  affected_cases: number;
  reviewer_id: number | null;
  decision: string | null;
  decision_note: string | null;
  model_before: string | null;
  model_after: string | null;
  test_count: number;
  passed_count: number;
  failed_count: number;
  created_at: string | null;
  reviewed_at: string | null;
}

interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  needs_discussion: number;
  by_regression_status: Record<string, number>;
}

export default function ReviewsPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);
  
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    
    fetchData();
  }, [router, projectId, filter]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const reviewsUrl = filter === 'all' 
        ? `${baseUrl}/api/v1/projects/${projectId}/reviews`
        : `${baseUrl}/api/v1/projects/${projectId}/reviews?status=${filter}`;
      
      const [reviewsRes, statsRes] = await Promise.all([
        fetch(reviewsUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${baseUrl}/api/v1/projects/${projectId}/reviews/stats`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);
      
      if (reviewsRes.ok) {
        const data = await reviewsRes.json();
        setReviews(data);
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
  };

  const handleDecision = async (reviewId: number, action: 'approve' | 'reject') => {
    try {
      const token = localStorage.getItem('access_token');
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      await fetch(
        `${baseUrl}/api/v1/projects/${projectId}/reviews/${reviewId}/${action}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      
      fetchData();
    } catch (error) {
      console.error('Failed to make decision:', error);
    }
  };

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="success">Approved</Badge>;
      case 'rejected':
        return <Badge variant="default">Rejected</Badge>;
      case 'needs_discussion':
        return <Badge variant="warning">Discussion</Badge>;
      default:
        return <Badge variant="info">Pending</Badge>;
    }
  };

  const getRegressionBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return <Badge variant="success">SAFE</Badge>;
      case 'regressed':
        return <Badge variant="warning">REGRESSED</Badge>;
      case 'critical':
        return <Badge variant="default">CRITICAL</Badge>;
      default:
        return <Badge variant="info">PENDING</Badge>;
    }
  };

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Reviews' },
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
            <h1 className="text-2xl font-bold text-white mb-2">Review Queue</h1>
            <p className="text-slate-400">Human-in-the-loop: Review and approve deployments</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400 mb-1">Total</p>
              <span className="text-2xl font-bold text-white">
                {loading ? '-' : stats?.total || 0}
              </span>
            </div>
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
              <p className="text-sm text-yellow-400 mb-1">Pending</p>
              <span className="text-2xl font-bold text-yellow-400">
                {loading ? '-' : stats?.pending || 0}
              </span>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <p className="text-sm text-green-400 mb-1">Approved</p>
              <span className="text-2xl font-bold text-green-400">
                {loading ? '-' : stats?.approved || 0}
              </span>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <p className="text-sm text-red-400 mb-1">Rejected</p>
              <span className="text-2xl font-bold text-red-400">
                {loading ? '-' : stats?.rejected || 0}
              </span>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-sm text-blue-400 mb-1">Discussion</p>
              <span className="text-2xl font-bold text-blue-400">
                {loading ? '-' : stats?.needs_discussion || 0}
              </span>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            {['all', 'pending', 'approved', 'rejected', 'needs_discussion'].map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'needs_discussion' ? 'Discussion' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>

          {/* Reviews List */}
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading...</div>
            ) : reviews.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No reviews yet.</p>
                <p className="text-sm mt-2">Run a regression test to create reviews.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {reviews.map((review) => (
                  <div key={review.id} className="p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusBadge(review.status)}
                          {getRegressionBadge(review.regression_status)}
                        </div>
                        <h3 className="text-white font-medium">{review.title}</h3>
                        {review.description && (
                          <p className="text-sm text-slate-400 mt-1 truncate">{review.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-400" />
                            {review.passed_count} passed
                          </span>
                          <span className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-red-400" />
                            {review.failed_count} failed
                          </span>
                          {review.model_before && review.model_after && (
                            <span>{review.model_before} → {review.model_after}</span>
                          )}
                          {review.created_at && (
                            <span>{new Date(review.created_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      
                      {review.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDecision(review.id, 'approve')}
                            className="text-green-400 hover:bg-green-500/20"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDecision(review.id, 'reject')}
                            className="text-red-400 hover:bg-red-500/20"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                      
                      {review.decision && (
                        <div className="text-sm text-slate-400">
                          Decision: <span className="text-white">{review.decision}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Human-in-the-Loop Workflow</h2>
            <div className="text-sm text-slate-400 space-y-2">
              <p>The review queue enables human oversight for deployment decisions:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Run tests in Test Lab to compare model versions</li>
                <li>Signals auto-detect potential issues</li>
                <li>Reviews are created for human decision</li>
                <li>Approve or reject based on results</li>
              </ol>
              <p className="mt-4 text-yellow-400">
                Critical: Always review CRITICAL status before deploying to production.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}
