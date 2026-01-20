'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProjectTabs from '@/components/ProjectTabs';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { shadowRoutingAPI, apiCallsAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, Sparkles, TrendingUp, AlertTriangle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface ShadowRoutingSuggestion {
  current_model: string;
  recommended_shadow_model: string;
  estimated_savings: number;
  estimated_cost_reduction_percentage: number;
  test_result: {
    similarity_score: number;
    quality_difference: number;
    latency_difference: number;
    cost_reduction: number;
  };
  confidence: number;
  usage_pattern: {
    total_calls: number;
    avg_latency_ms: number;
    total_cost: number;
    avg_quality_score: number;
    complexity: string;
  };
  auto_apply: boolean;
  requires_approval: boolean;
}

export default function ShadowRoutingPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [suggestions, setSuggestions] = useState<ShadowRoutingSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [primaryModel, setPrimaryModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    loadAvailableModels();
  }, [projectId]);

  const loadAvailableModels = async () => {
    try {
      // Get models from API calls
      const calls = await apiCallsAPI.list(projectId, { limit: 100 });
      const models = Array.from(new Set(calls.map((call: any) => call.model))).filter(Boolean) as string[];
      setAvailableModels(models);
      
      if (models.length > 0 && !primaryModel) {
        setPrimaryModel(models[0]);
      }
    } catch (error: any) {
      console.error('Failed to load models:', error);
    }
  };

  const loadSuggestions = async () => {
    if (!primaryModel) return;
    
    setLoading(true);
    try {
      const result = await shadowRoutingAPI.getSuggestions(projectId, primaryModel);
      setSuggestions(result);
    } catch (error: any) {
      console.error('Failed to load suggestions:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load shadow routing suggestions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (primaryModel) {
      loadSuggestions();
    }
  }, [primaryModel, projectId]);

  const handleApply = async () => {
    if (!suggestions || !suggestions.recommended_shadow_model) return;
    
    setApplying(true);
    try {
      const result = await shadowRoutingAPI.apply(
        projectId,
        primaryModel,
        suggestions.recommended_shadow_model,
        true
      );
      
      if (result.status === 'success') {
        toast.showToast('Shadow routing applied successfully!', 'success');
        setShowApplyModal(false);
        // Reload suggestions to see updated status
        loadSuggestions();
      } else {
        toast.showToast(result.reason || 'Failed to apply shadow routing', 'error');
      }
    } catch (error: any) {
      console.error('Failed to apply shadow routing:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to apply shadow routing', 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async () => {
    try {
      const result = await shadowRoutingAPI.rollback(projectId);
      toast.showToast('Shadow routing rolled back successfully', 'success');
      loadSuggestions();
    } catch (error: any) {
      console.error('Failed to rollback:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to rollback', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              onClick={() => router.push(`/dashboard/${projectId}`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-white">Shadow Routing</h1>
              <p className="text-slate-400 mt-2">
                Automatically test and gradually apply shadow models for cost optimization
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Primary Model Selection */}
        <div className="mb-6 relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-4">Select Primary Model</h2>
          <div className="flex items-center gap-4">
            <select
              value={primaryModel}
              onChange={(e) => setPrimaryModel(e.target.value)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a model...</option>
              {availableModels.map((model) => (
                <option key={model} value={model} className="bg-[#0B0C15]">
                  {model}
                </option>
              ))}
            </select>
            <Button
              onClick={loadSuggestions}
              disabled={!primaryModel || loading}
              variant="ghost"
            >
              <RefreshCw className={clsx('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        )}

        {/* Suggestions */}
        {!loading && suggestions && (
          <div className="space-y-6">
            {/* Recommendation Card */}
            <div className="relative rounded-2xl border border-purple-500/30 bg-purple-500/10 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-purple-400" />
                  <h2 className="text-xl font-semibold text-purple-400">Recommended Shadow Model</h2>
                </div>
                <Badge variant="success" className="text-sm">
                  {toFixedSafe(suggestions.confidence * 100, 0)}% Confidence
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Current Model</div>
                  <div className="text-lg font-bold text-white">{suggestions.current_model}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Recommended Shadow Model</div>
                  <div className="text-lg font-bold text-purple-400">{suggestions.recommended_shadow_model}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Estimated Monthly Savings</div>
                  <div className="text-lg font-bold text-green-400">
                    ${toFixedSafe(suggestions.estimated_savings, 2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Cost Reduction</div>
                  <div className="text-lg font-bold text-green-400">
                    {toFixedSafe(suggestions.estimated_cost_reduction_percentage, 1)}%
                  </div>
                </div>
              </div>

              {/* Test Results */}
              {suggestions.test_result && (
                <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm font-medium text-white mb-3">Estimated Test Results</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Similarity</div>
                      <div className="text-sm font-bold text-white">
                        {toFixedSafe(suggestions.test_result.similarity_score * 100, 1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Quality Change</div>
                      <div className={clsx(
                        'text-sm font-bold',
                        suggestions.test_result.quality_difference >= 0 ? 'text-green-400' : 'text-yellow-400'
                      )}>
                        {suggestions.test_result.quality_difference > 0 ? '+' : ''}
                        {toFixedSafe(suggestions.test_result.quality_difference, 1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Latency Change</div>
                      <div className={clsx(
                        'text-sm font-bold',
                        suggestions.test_result.latency_difference <= 0 ? 'text-green-400' : 'text-yellow-400'
                      )}>
                        {suggestions.test_result.latency_difference > 0 ? '+' : ''}
                        {toFixedSafe(suggestions.test_result.latency_difference, 1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Cost Reduction</div>
                      <div className="text-sm font-bold text-green-400">
                        {toFixedSafe(suggestions.test_result.cost_reduction, 2)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Usage Pattern */}
              {suggestions.usage_pattern && (
                <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm font-medium text-white mb-3">Usage Pattern</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Total Calls</div>
                      <div className="text-sm font-bold text-white">{suggestions.usage_pattern.total_calls}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Avg Latency</div>
                      <div className="text-sm font-bold text-white">
                        {toFixedSafe(suggestions.usage_pattern.avg_latency_ms / 1000, 2)}s
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Total Cost</div>
                      <div className="text-sm font-bold text-white">
                        ${toFixedSafe(suggestions.usage_pattern.total_cost, 2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Complexity</div>
                      <Badge variant={
                        suggestions.usage_pattern.complexity === 'high' ? 'error' :
                        suggestions.usage_pattern.complexity === 'medium' ? 'warning' : 'success'
                      }>
                        {suggestions.usage_pattern.complexity}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => {
                    setSelectedModel(suggestions.recommended_shadow_model);
                    setShowApplyModal(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Apply Gradually
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleRollback}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Rollback
                </Button>
              </div>
            </div>

            {/* Info Card */}
            <div className="relative rounded-2xl border border-blue-500/30 bg-blue-500/10 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-blue-400 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-blue-400 mb-2">How Shadow Routing Works</h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li>• Shadow routing gradually applies the new model: 10% → 25% → 50% → 75% → 100%</li>
                    <li>• Each phase is validated before proceeding to the next</li>
                    <li>• Automatic rollback if validation fails at any phase</li>
                    <li>• All changes require your approval before application</li>
                    <li>• You can rollback at any time</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No Suggestions */}
        {!loading && !suggestions && primaryModel && (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-slate-400 opacity-50" />
            <p className="text-slate-400">No shadow routing suggestions available for this model.</p>
          </div>
        )}

        {/* Apply Confirmation Modal */}
        <Modal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          title="Apply Shadow Routing"
          size="medium"
        >
          <div className="space-y-4">
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                <div>
                  <div className="font-medium text-yellow-400 mb-1">Confirm Application</div>
                  <div className="text-sm text-slate-300">
                    Shadow routing will be applied gradually (10% → 25% → 50% → 75% → 100%).
                    Each phase will be validated before proceeding. You can rollback at any time.
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Primary Model:</span>
                <span className="text-white font-medium">{primaryModel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Shadow Model:</span>
                <span className="text-purple-400 font-medium">{selectedModel}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-4">
              <Button
                onClick={handleApply}
                disabled={applying}
                className="flex-1"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirm & Apply
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowApplyModal(false)}
                disabled={applying}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
