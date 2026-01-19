'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import JSONViewer from '@/components/ui/JSONViewer';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { apiCallsAPI, qualityAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, ArrowRight, Clock, DollarSign, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export default function APICallDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);
  const callId = Number(params.callId);
  
  const [apiCall, setApiCall] = useState<any>(null);
  const [qualityScore, setQualityScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [prevCallId, setPrevCallId] = useState<number | null>(null);
  const [nextCallId, setNextCallId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadAPICall();
  }, [callId, projectId, router]);

  const loadAPICall = async () => {
    try {
      const [callData, callsList] = await Promise.all([
        apiCallsAPI.get(callId),
        apiCallsAPI.list(projectId, { limit: 1000 }),
      ]);

      setApiCall(callData);

      // Find previous and next calls
      const currentIndex = callsList.findIndex((c: any) => c.id === callId);
      if (currentIndex > 0) {
        setPrevCallId(callsList[currentIndex - 1].id);
      } else {
        setPrevCallId(null);
      }
      if (currentIndex < callsList.length - 1 && currentIndex >= 0) {
        setNextCallId(callsList[currentIndex + 1].id);
      } else {
        setNextCallId(null);
      }

      // Load quality score if available
      try {
        const scores = await qualityAPI.getScores(projectId, { limit: 1000 });
        const score = scores.find((s: any) => s.api_call_id === callId);
        if (score) {
          setQualityScore(score);
        }
      } catch (error) {
        // Quality score not available, ignore
      }
    } catch (error: any) {
      console.error('Failed to load API call:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load API call', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      } else if (error.response?.status === 404) {
        router.push(`/dashboard/${projectId}/api-calls`);
      }
    } finally {
      setLoading(false);
    }
  };

  const navigateToCall = (newCallId: number) => {
    router.push(`/dashboard/${projectId}/api-calls/${newCallId}`);
  };

  const getStatusBadge = () => {
    if (!apiCall?.status_code) {
      return <Badge variant="default">Unknown</Badge>;
    }
    
    if (apiCall.status_code >= 200 && apiCall.status_code < 300) {
      return <Badge variant="success">Success</Badge>;
    } else if (apiCall.status_code >= 400 && apiCall.status_code < 500) {
      return <Badge variant="warning">Client Error</Badge>;
    } else if (apiCall.status_code >= 500) {
      return <Badge variant="error">Server Error</Badge>;
    } else {
      return <Badge variant="default">{apiCall.status_code}</Badge>;
    }
  };

  const calculateCost = () => {
    // Simple cost calculation - in production, use actual pricing
    if (!apiCall?.request_tokens || !apiCall?.response_tokens) return null;
    
    // Example pricing (adjust based on provider/model)
    const inputPrice = 0.00003; // per 1K tokens
    const outputPrice = 0.00006; // per 1K tokens
    
    const cost = (apiCall.request_tokens / 1000) * inputPrice + (apiCall.response_tokens / 1000) * outputPrice;
    return toFixedSafe(cost, 6);
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

  if (!apiCall) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">API Call Not Found</h3>
          <p className="text-gray-600 mb-4">The API call you're looking for doesn't exist or you don't have access to it.</p>
          <Button onClick={() => router.push(`/dashboard/${projectId}/api-calls`)}>
            Back to API Calls
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
              onClick={() => router.push(`/dashboard/${projectId}/api-calls`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">API Call Details</h1>
              <p className="text-sm text-gray-600 mt-1">
                {new Date(apiCall.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {prevCallId && (
              <Button
                variant="secondary"
                onClick={() => navigateToCall(prevCallId)}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
            )}
            {nextCallId && (
              <Button
                variant="secondary"
                onClick={() => navigateToCall(nextCallId)}
                className="flex items-center gap-2"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Metadata Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={clsx(
                'h-5 w-5',
                apiCall.status_code >= 200 && apiCall.status_code < 300
                  ? 'text-green-600'
                  : 'text-red-600'
              )} />
              <span className="text-sm font-medium text-gray-700">Status</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {apiCall.status_code && (
                <span className="text-sm text-gray-600">({apiCall.status_code})</span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Latency</span>
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {apiCall.latency_ms ? `${toFixedSafe(apiCall.latency_ms, 0)}ms` : 'N/A'}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Cost</span>
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {calculateCost() ? `$${calculateCost()}` : 'N/A'}
            </div>
            {apiCall.request_tokens && apiCall.response_tokens && (
              <div className="text-xs text-gray-500 mt-1">
                {apiCall.request_tokens.toLocaleString()} in / {apiCall.response_tokens.toLocaleString()} out tokens
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Model</div>
            <div className="text-lg font-semibold text-gray-900">
              {apiCall.provider}/{apiCall.model}
            </div>
            {apiCall.agent_name && (
              <div className="text-xs text-gray-500 mt-1">
                Agent: {apiCall.agent_name}
              </div>
            )}
          </div>
        </div>

        {/* Quality Score */}
        {qualityScore && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Score</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Overall</div>
                <div className="text-2xl font-bold text-gray-900">
                  {toFixedSafe(qualityScore.overall_score, 1)}%
                </div>
              </div>
              {qualityScore.semantic_consistency_score !== null && (
                <div>
                  <div className="text-sm text-gray-600">Semantic</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {toFixedSafe(qualityScore.semantic_consistency_score, 1)}%
                  </div>
                </div>
              )}
              {qualityScore.tone_score !== null && (
                <div>
                  <div className="text-sm text-gray-600">Tone</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {toFixedSafe(qualityScore.tone_score, 1)}%
                  </div>
                </div>
              )}
              {qualityScore.coherence_score !== null && (
                <div>
                  <div className="text-sm text-gray-600">Coherence</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {toFixedSafe(qualityScore.coherence_score, 1)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Request Data */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Request</h2>
          <JSONViewer data={apiCall.request_data} searchable />
        </div>

        {/* Response Data */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Response</h2>
          <JSONViewer data={apiCall.response_data} searchable />
        </div>

        {/* Error Message */}
        {apiCall.error_message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-900 mb-2">Error Message</h3>
            <p className="text-sm text-red-700">{apiCall.error_message}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

