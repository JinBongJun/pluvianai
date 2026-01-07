'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import JSONViewer from '@/components/ui/JSONViewer';
import { driftAPI, apiCallsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';

export default function DriftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);
  const driftId = Number(params.driftId);
  
  const [drift, setDrift] = useState<any>(null);
  const [relatedCalls, setRelatedCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadDrift();
  }, [driftId, projectId, router]);

  const loadDrift = async () => {
    try {
      const driftData = await driftAPI.get(driftId);
      setDrift(driftData);

      // Load related API calls if agent_name or model is specified
      if (driftData.agent_name || driftData.model) {
        try {
          const calls = await apiCallsAPI.list(projectId, {
            limit: 50,
            agent_name: driftData.agent_name,
            model: driftData.model,
          });
          setRelatedCalls(calls);
        } catch (error) {
          // Ignore errors loading related calls
        }
      }
    } catch (error: any) {
      console.error('Failed to load drift detection:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load drift detection', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      } else if (error.response?.status === 404) {
        router.push(`/dashboard/${projectId}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'default' => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'default';
      default:
        return 'default';
    }
  };

  const getChangeIcon = () => {
    if (!drift) return null;
    const isIncrease = drift.change_percentage > 0;
    return isIncrease ? (
      <TrendingUp className="h-5 w-5 text-red-600" />
    ) : (
      <TrendingDown className="h-5 w-5 text-green-600" />
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!drift) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Drift Detection Not Found</h3>
          <p className="text-gray-600 mb-4">The drift detection you're looking for doesn't exist or you don't have access to it.</p>
          <Button onClick={() => router.push(`/dashboard/${projectId}`)}>
            Back to Project
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              onClick={() => router.push(`/dashboard/${projectId}`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Drift Detection</h1>
              <p className="text-sm text-gray-600 mt-1">
                Detected on {new Date(drift.detected_at).toLocaleString()}
              </p>
            </div>
          </div>
          <Badge variant={getSeverityColor(drift.severity)}>
            {drift.severity}
          </Badge>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Detection Type</div>
            <div className="text-lg font-semibold text-gray-900 capitalize">
              {drift.detection_type.replace('_', ' ')}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Change Percentage</div>
            <div className="flex items-center gap-2">
              {getChangeIcon()}
              <span className="text-lg font-semibold text-gray-900">
                {Math.abs(drift.change_percentage).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Drift Score</div>
            <div className="text-lg font-semibold text-gray-900">
              {drift.drift_score.toFixed(1)}/100
            </div>
          </div>
        </div>

        {/* Before/After Comparison */}
        {(drift.baseline_value !== null || drift.current_value !== null) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Before/After Comparison</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Baseline Value</div>
                <div className="text-2xl font-bold text-gray-900">
                  {drift.baseline_value !== null ? drift.baseline_value.toFixed(2) : 'N/A'}
                </div>
                {drift.baseline_period_start && drift.baseline_period_end && (
                  <div className="text-xs text-gray-500 mt-2">
                    Period: {new Date(drift.baseline_period_start).toLocaleDateString()} - {new Date(drift.baseline_period_end).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Current Value</div>
                <div className="text-2xl font-bold text-gray-900">
                  {drift.current_value !== null ? drift.current_value.toFixed(2) : 'N/A'}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Detected: {new Date(drift.detected_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Detection Details */}
        {drift.detection_details && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Detection Details</h2>
            <JSONViewer data={drift.detection_details} searchable />
          </div>
        )}

        {/* Affected Fields */}
        {drift.affected_fields && drift.affected_fields.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Affected Fields</h2>
            <div className="flex flex-wrap gap-2">
              {drift.affected_fields.map((field: string, index: number) => (
                <Badge key={index} variant="default">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Model/Agent Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Context</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drift.model && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Model</div>
                <div className="text-gray-900">{drift.model}</div>
              </div>
            )}
            {drift.agent_name && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Agent</div>
                <div className="text-gray-900">{drift.agent_name}</div>
              </div>
            )}
          </div>
        </div>

        {/* Related API Calls */}
        {relatedCalls.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Related API Calls</h2>
              <Button
                variant="secondary"
                onClick={() => router.push(`/dashboard/${projectId}/api-calls`)}
              >
                View All
              </Button>
            </div>
            <div className="space-y-2">
              {relatedCalls.slice(0, 10).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                  onClick={() => router.push(`/dashboard/${projectId}/api-calls/${call.id}`)}
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {call.provider}/{call.model}
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(call.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {call.latency_ms ? `${call.latency_ms.toFixed(0)}ms` : 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

