'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProjectLayout from '@/components/layout/ProjectLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { ArrowLeft, Shield, AlertTriangle, CheckCircle, XCircle, Settings } from 'lucide-react';

interface Signal {
  signal_type: string;
  detected: boolean;
  confidence: number;
  severity: string;
  details: Record<string, unknown>;
}

interface ProjectStatus {
  status: string;
  pending_reviews: number;
  recent_failures: number;
  worst_prompts_count: number;
  message: string;
}

const SIGNAL_TYPES = [
  { type: 'hallucination', name: 'Hallucination', description: 'Detect potential hallucination in responses', icon: AlertTriangle },
  { type: 'length_change', name: 'Length Change', description: 'Detect significant changes in response length', icon: Shield },
  { type: 'refusal_increase', name: 'Refusal Detection', description: 'Detect refusal patterns in responses', icon: XCircle },
  { type: 'json_schema_break', name: 'JSON Schema Break', description: 'Detect invalid JSON when JSON was expected', icon: AlertTriangle },
  { type: 'latency_spike', name: 'Latency Spike', description: 'Detect significant latency increases', icon: Shield },
  { type: 'tool_misuse', name: 'Tool Misuse', description: 'Detect tool/function call issues', icon: Settings },
];

export default function SignalsPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);
  
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    
    // Fetch project status
    fetchProjectStatus();
  }, [router, projectId]);

  const fetchProjectStatus = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/quality/project-status?project_id=${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        const result = await response.json();
        setStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  const getStatusBadge = (statusValue: string) => {
    switch (statusValue) {
      case 'safe':
        return <Badge variant="success">SAFE</Badge>;
      case 'regressed':
        return <Badge variant="warning">REGRESSED</Badge>;
      case 'critical':
        return <Badge variant="default">CRITICAL</Badge>;
      default:
        return <Badge variant="default">PENDING</Badge>;
    }
  };

  const getStatusIcon = (statusValue: string) => {
    switch (statusValue) {
      case 'safe':
        return <CheckCircle className="h-12 w-12 text-green-400" />;
      case 'regressed':
        return <AlertTriangle className="h-12 w-12 text-yellow-400" />;
      case 'critical':
        return <XCircle className="h-12 w-12 text-red-400" />;
      default:
        return <Shield className="h-12 w-12 text-slate-400" />;
    }
  };

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: 'Signals' },
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
            <h1 className="text-2xl font-bold text-white mb-2">Signal Detection Dashboard</h1>
            <p className="text-slate-400">Monitor regression status with signal-based detection (not LLM scores)</p>
          </div>

          {/* Current Status */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {loading ? (
                  <div className="h-12 w-12 bg-white/10 rounded-full animate-pulse" />
                ) : (
                  getStatusIcon(status?.status || 'pending')
                )}
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">Current Status</h2>
                    {!loading && getStatusBadge(status?.status || 'pending')}
                  </div>
                  <p className="text-slate-400 mt-1">
                    {loading ? 'Loading...' : status?.message}
                  </p>
                </div>
              </div>
              <Button variant="primary" onClick={() => router.push(`${basePath}/reviews`)}>
                View Reviews
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-slate-400 mb-1">Pending Reviews</p>
              <span className="text-3xl font-bold text-white">
                {loading ? '-' : status?.pending_reviews || 0}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-slate-400 mb-1">Recent Failures</p>
              <span className="text-3xl font-bold text-red-400">
                {loading ? '-' : status?.recent_failures || 0}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-slate-400 mb-1">Worst Prompts</p>
              <span className="text-3xl font-bold text-yellow-400">
                {loading ? '-' : status?.worst_prompts_count || 0}
              </span>
            </div>
          </div>

          {/* Signal Types */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Active Signal Detectors</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SIGNAL_TYPES.map((signal) => {
                const Icon = signal.icon;
                return (
                  <div
                    key={signal.type}
                    className="p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className="h-5 w-5 text-ag-accent" />
                      <h3 className="font-medium text-white">{signal.name}</h3>
                    </div>
                    <p className="text-sm text-slate-400">{signal.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => router.push(`${basePath}/worst-prompts`)}>
                View Worst Prompts
              </Button>
              <Button variant="secondary" onClick={() => router.push(`${basePath}/reviews`)}>
                Pending Reviews
              </Button>
              <Button variant="secondary" onClick={() => router.push(`${basePath}/replay`)}>
                Run Shadow Replay
              </Button>
            </div>
          </div>

          {/* Info */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">About Signal-Based Detection</h2>
            <div className="text-sm text-slate-400 space-y-2">
              <p>Signal-based detection replaces traditional LLM-as-Judge scoring with clear status indicators:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><span className="text-green-400 font-medium">SAFE</span> - No issues detected, OK to deploy</li>
                <li><span className="text-yellow-400 font-medium">REGRESSED</span> - Some issues detected, review recommended</li>
                <li><span className="text-red-400 font-medium">CRITICAL</span> - Critical issues detected, do not deploy</li>
              </ul>
              <p className="mt-4">
                Signals are rule-based and deterministic, avoiding the &quot;entropy multiplying&quot; problem of LLM-as-Judge systems.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}
