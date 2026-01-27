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
import { ArrowLeft, Sparkles, TrendingUp, AlertTriangle, CheckCircle, Loader2, RefreshCw, Info, HelpCircle } from 'lucide-react';
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load models:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
    }
  };

  const loadSuggestions = async () => {
    if (!primaryModel) return;
    
    setLoading(true);
    try {
      const result = await shadowRoutingAPI.getSuggestions(projectId, primaryModel);
      setSuggestions(result);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load suggestions:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to apply shadow routing:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to rollback:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to rollback', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/dashboard/${projectId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Shadow Routing</h1>
              <p className="text-slate-400 mt-1 text-sm">
                Test and gradually apply cheaper models to reduce costs
              </p>
            </div>
          </div>
          <div className="ml-11 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-slate-300">
                <p className="font-medium text-blue-400 mb-1">What is Shadow Routing?</p>
                <p>Run cheaper models in parallel with production models for comparison. If quality is maintained, gradually apply (10% → 25% → 50% → 75% → 100%) to reduce costs.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Primary Model Selection */}
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm font-medium text-white">Select Production Model</label>
            <div className="group relative">
              <HelpCircle className="h-3 w-3 text-slate-400 cursor-help" />
              <div className="absolute left-0 top-6 w-64 p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <p>
                  Select the model currently used in production. We&apos;ll automatically recommend cheaper alternatives.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={primaryModel}
              onChange={(e) => setPrimaryModel(e.target.value)}
              className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select model...</option>
              {availableModels.map((model) => (
                <option key={model} value={model} className="bg-[#0B0C15]">
                  {model}
                </option>
              ))}
            </select>
            <Button
              onClick={loadSuggestions}
              disabled={!primaryModel || loading}
              size="sm"
              variant="ghost"
            >
              <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
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
          <div className="space-y-4">
            {/* Recommendation Card */}
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-400">Recommended Shadow Model</span>
                    <div className="group relative">
                      <HelpCircle className="h-3 w-3 text-slate-400 cursor-help" />
                      <div className="absolute left-0 top-6 w-64 p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                        <p>Based on AI analysis, this model can maintain similar quality to your production model while reducing costs.</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">Cheaper alternative model recommendation</p>
                </div>
                <Badge variant="success" className="text-xs">
                  {toFixedSafe(suggestions.confidence * 100, 0)}% confidence
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Current Model</div>
                  <div className="text-sm font-bold text-white">{suggestions.current_model}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Recommended Shadow Model</div>
                  <div className="text-sm font-bold text-purple-400">{suggestions.recommended_shadow_model}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Estimated Savings</div>
                  <div className="text-sm font-bold text-green-400">
                    ${toFixedSafe(suggestions.estimated_savings, 2)}/mo
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Cost Reduction</div>
                  <div className="text-sm font-bold text-green-400">
                    {toFixedSafe(suggestions.estimated_cost_reduction_percentage, 1)}%
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedModel(suggestions.recommended_shadow_model);
                    setShowApplyModal(true);
                  }}
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Apply Gradually
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRollback}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Rollback
                </Button>
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
          size="md"
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
