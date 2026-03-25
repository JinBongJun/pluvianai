"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectLayout from "@/components/layout/ProjectLayout";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import JSONViewer from "@/components/ui/JSONViewer";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { apiCallsAPI, qualityAPI } from "@/lib/api";
import { toFixedSafe } from "@/lib/format";
import { useToast } from "@/components/ToastContainer";
import { ArrowLeft, ArrowRight, Clock, DollarSign, CheckCircle, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

export default function APICallDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const { orgId, projectId } = useOrgProjectParams();
  const isAuthenticated = useRequireAuth();
  const callId = Number(
    Array.isArray(params?.callId) ? params.callId[0] : params?.callId
  );

  const [apiCall, setApiCall] = useState<any>(null);
  const [qualityScore, setQualityScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [prevCallId, setPrevCallId] = useState<number | null>(null);
  const [nextCallId, setNextCallId] = useState<number | null>(null);

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  const loadAPICall = useCallback(async () => {
    try {
      const [callData, callsList] = await Promise.all([
        apiCallsAPI.get(projectId, callId),
        apiCallsAPI.list(projectId, { limit: 1000 }),
      ]);

      setApiCall(callData);

      // Find previous and next calls
      const calls: any[] = Array.isArray(callsList) ? (callsList as any[]) : [];
      const currentIndex = calls.findIndex((c: any) => c && c.id === callId);
      if (currentIndex > 0 && calls[currentIndex - 1]?.id) {
        setPrevCallId(calls[currentIndex - 1].id);
      } else {
        setPrevCallId(null);
      }
      if (currentIndex < calls.length - 1 && currentIndex >= 0 && calls[currentIndex + 1]?.id) {
        setNextCallId(calls[currentIndex + 1].id);
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
      console.error("Failed to load API call:", error);
      toast.showToast(error.response?.data?.detail || "Failed to load API call", "error");
      if (error.response?.status === 401) {
        router.push("/login");
      } else if (error.response?.status === 404) {
        router.push(`${basePath}/api-calls`);
      }
    } finally {
      setLoading(false);
    }
  }, [callId, projectId, basePath, router, toast]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadAPICall();
  }, [isAuthenticated, loadAPICall]);

  const navigateToCall = (newCallId: number) => {
    router.push(`${basePath}/api-calls/${newCallId}`);
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
    if (!apiCall?.request_tokens || !apiCall?.response_tokens) return null;

    const inputPrice = 0.00003;
    const outputPrice = 0.00006;

    const cost =
      (apiCall.request_tokens / 1000) * inputPrice + (apiCall.response_tokens / 1000) * outputPrice;
    return toFixedSafe(cost, 6);
  };

  if (loading) {
    return (
      <ProjectLayout
        orgId={orgId}
        projectId={projectId}
        breadcrumb={[
          { label: "API Calls", href: `${basePath}/api-calls` },
          { label: "Loading..." },
        ]}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>
      </ProjectLayout>
    );
  }

  if (!apiCall) {
    return (
      <ProjectLayout
        orgId={orgId}
        projectId={projectId}
        breadcrumb={[{ label: "API Calls", href: `${basePath}/api-calls` }, { label: "Not Found" }]}
      >
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">API Call Not Found</h3>
          <p className="text-gray-400 mb-4">
            The API call you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to
            it.
          </p>
          <Button onClick={() => router.push(`${basePath}/api-calls`)}>Back to API Calls</Button>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: "API Calls", href: `${basePath}/api-calls` },
        { label: `Call #${callId}` },
      ]}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              onClick={() => router.push(`${basePath}/api-calls`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">API Call Details</h1>
              <p className="text-sm text-gray-400 mt-1">
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
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle
                className={clsx(
                  "h-5 w-5",
                  apiCall.status_code >= 200 && apiCall.status_code < 300
                    ? "text-emerald-500"
                    : "text-red-500"
                )}
              />
              <span className="text-sm font-medium text-gray-400">Status</span>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {apiCall.status_code && (
                <span className="text-sm text-gray-500">({apiCall.status_code})</span>
              )}
            </div>
          </div>

          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium text-gray-400">Latency</span>
            </div>
            <div className="text-lg font-semibold text-white">
              {apiCall.latency_ms ? `${toFixedSafe(apiCall.latency_ms, 0)}ms` : "N/A"}
            </div>
          </div>

          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-medium text-gray-400">Cost</span>
            </div>
            <div className="text-lg font-semibold text-white">
              {calculateCost() ? `$${calculateCost()}` : "N/A"}
            </div>
            {apiCall.request_tokens && apiCall.response_tokens && (
              <div className="text-xs text-gray-500 mt-1">
                {apiCall.request_tokens.toLocaleString()} in /{" "}
                {apiCall.response_tokens.toLocaleString()} out tokens
              </div>
            )}
          </div>

          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-4">
            <div className="text-sm font-medium text-gray-400 mb-2">Model</div>
            <div className="text-lg font-semibold text-white">
              {apiCall.provider || "unknown"}/
              {apiCall.model || apiCall.request_data?.model || "unknown"}
            </div>
            {apiCall.agent_name && (
              <div className="text-xs text-gray-500 mt-1">Agent: {apiCall.agent_name}</div>
            )}
          </div>
        </div>

        {/* Quality Score */}
        {qualityScore && (
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Quality Score</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-400">Overall</div>
                <div className="text-2xl font-bold text-white">
                  {toFixedSafe(qualityScore.overall_score, 1)}%
                </div>
              </div>
              {qualityScore.semantic_consistency_score !== null && (
                <div>
                  <div className="text-sm text-gray-400">Semantic</div>
                  <div className="text-xl font-semibold text-white">
                    {toFixedSafe(qualityScore.semantic_consistency_score, 1)}%
                  </div>
                </div>
              )}
              {qualityScore.tone_score !== null && (
                <div>
                  <div className="text-sm text-gray-400">Tone</div>
                  <div className="text-xl font-semibold text-white">
                    {toFixedSafe(qualityScore.tone_score, 1)}%
                  </div>
                </div>
              )}
              {qualityScore.coherence_score !== null && (
                <div>
                  <div className="text-sm text-gray-400">Coherence</div>
                  <div className="text-xl font-semibold text-white">
                    {toFixedSafe(qualityScore.coherence_score, 1)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Request Data */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Request</h2>
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-4">
            <JSONViewer data={apiCall.request_data} searchable />
          </div>
        </div>

        {/* Response Data */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Response</h2>
          <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 p-4">
            <JSONViewer data={apiCall.response_data} searchable />
          </div>
        </div>

        {/* Error Message */}
        {apiCall.error_message && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-400 mb-2">Error Message</h3>
            <p className="text-sm text-red-300">{apiCall.error_message}</p>
          </div>
        )}
      </div>
    </ProjectLayout>
  );
}
