'use client';

import { useState } from 'react';
import { modelValidationAPI, sharedResultsAPI } from '@/lib/api';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { Zap, CheckCircle, XCircle, Loader2, AlertTriangle, Share2, Copy, Check } from 'lucide-react';
import { useToast } from '@/components/ToastContainer';
import AsyncJudgeState from '@/components/states/AsyncJudgeState';
import QuotaExceededState from '@/components/states/QuotaExceededState';
import posthog from 'posthog-js';

interface ModelValidationProps {
  projectId: number;
}

interface ValidationResult {
  safe: boolean;
  average_score: number;
  score_drop_percentage?: number;
  total_tested: number;
  passed: number;
  failed: number;
  summary: string;
  details: Array<{
    snapshot_id?: number;
    score?: number;
    regression_detected?: boolean;
    reasoning?: string;
    success?: boolean;
    error?: string;
  }>;
}

const ALLOWED_MODELS = {
  openai: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet'],
  google: ['gemini-pro', 'gemini-pro-vision'],
};

export default function ModelValidation({ projectId }: ModelValidationProps) {
  const toast = useToast();
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('openai');
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4');
  const [rubricId, setRubricId] = useState<number | undefined>(undefined);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [upgradeDetails, setUpgradeDetails] = useState<any>(null);

  const handleValidate = async () => {
    if (!selectedModel || !selectedProvider) {
      toast.showToast('Please select a model and provider', 'error');
      return;
    }

    setIsValidating(true);
    setResult(null);

    try {
      setQuotaExceeded(false);
      setUpgradeDetails(null);
      
      const validationResult = await modelValidationAPI.validateModel(projectId, {
        new_model: selectedModel,
        provider: selectedProvider,
        rubric_id: rubricId,
      });

      // Track model validation event
      posthog.capture('model_validation_started', {
        project_id: projectId,
        new_model: selectedModel,
        provider: selectedProvider,
        has_rubric: !!rubricId,
        passed: validationResult.passed,
        score: validationResult.score,
      });

      setResult(validationResult);
      toast.showToast('Model validation completed!', 'success');
    } catch (error: any) {
      // Check for upgrade required
      if (error.upgradeRequired || error.response?.headers['x-upgrade-required'] === 'true') {
        setQuotaExceeded(true);
        setUpgradeDetails(error.response?.data?.error?.details || error.upgradeDetails || {});
        return;
      }
      
      const errorMessage = error.response?.data?.error?.message || 
                          error.response?.data?.detail || 
                          'Failed to validate model';
      toast.showToast(errorMessage, 'error');
    } finally {
      setIsValidating(false);
    }
  };

  const availableModels = ALLOWED_MODELS[selectedProvider as keyof typeof ALLOWED_MODELS] || [];

  return (
    <div className="bg-ag-surface rounded-lg border border-white/10 p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-6 w-6 text-ag-accent" />
          <h2 className="text-2xl font-bold text-ag-text">One-Click Model Safety Validation</h2>
        </div>
        <p className="text-ag-muted">
          Test a new model against your last 100 snapshots to ensure it&apos;s safe to deploy
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-ag-text mb-2">
            Provider
          </label>
          <Select
            value={selectedProvider}
            onChange={(val) => {
              const newVal = val || 'openai';
              setSelectedProvider(newVal);
              const models = ALLOWED_MODELS[newVal as keyof typeof ALLOWED_MODELS] || [];
              setSelectedModel(models[0] || '');
            }}
            options={Object.keys(ALLOWED_MODELS).map((provider) => ({
              value: provider,
              label: provider.charAt(0).toUpperCase() + provider.slice(1)
            }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ag-text mb-2">
            Model
          </label>
          <Select
            value={selectedModel}
            onChange={(val) => setSelectedModel(val || '')}
            options={availableModels.map((model) => ({
              value: model,
              label: model
            }))}
          />
        </div>
      </div>

      <Button
        onClick={handleValidate}
        disabled={isValidating || !selectedModel}
        className="w-full mb-6"
        size="lg"
      >
        {isValidating ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Validating Model...
          </>
        ) : (
          <>
            <Zap className="mr-2 h-5 w-5" />
            Validate Model Safety
          </>
        )}
      </Button>

      {isValidating && (
        <div className="mb-6">
          <AsyncJudgeState message="Running AI Judge evaluation. This may take a few moments..." />
        </div>
      )}

      {quotaExceeded && (
        <div className="mb-6">
          <QuotaExceededState
            title={upgradeDetails?.feature ? `Upgrade required for ${upgradeDetails.feature}` : 'Quota exceeded'}
            description={upgradeDetails?.message || "You've hit your plan limit. Upgrade to continue."}
            upgradeUrl={upgradeDetails?.upgrade_url || '/settings/subscription'}
          />
        </div>
      )}

      {result && (
        <div className="mt-6 border-t border-white/10 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-ag-text">Validation Result</h3>
            <Button
              onClick={async () => {
                setIsSharing(true);
                try {
                  const shareResult = await sharedResultsAPI.share(projectId, {
                    result_type: 'model_validation',
                    result_data: result,
                    expires_in_days: 30,
                  });
                  const fullUrl = `${window.location.origin}${shareResult.share_url}`;
                  setShareUrl(fullUrl);
                  
                  // Copy to clipboard
                  await navigator.clipboard.writeText(fullUrl);
                  setCopied(true);
                  toast.showToast('Share link copied to clipboard!', 'success');
                  setTimeout(() => setCopied(false), 2000);
                } catch (error: any) {
                  toast.showToast(error.response?.data?.detail || 'Failed to create share link', 'error');
                } finally {
                  setIsSharing(false);
                }
              }}
              disabled={isSharing}
              variant="outline"
              size="sm"
            >
              {isSharing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sharing...
                </>
              ) : copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share Result
                </>
              )}
            </Button>
          </div>

          {shareUrl && (
            <div className="mb-4 p-3 bg-ag-primary/10 border border-ag-primary/30 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ag-text">Share URL:</span>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    toast.showToast('Copied!', 'success');
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="text-ag-accent hover:text-ag-accentLight"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="mt-2 w-full px-3 py-2 text-sm border border-white/10 rounded bg-ag-surface text-ag-text"
              />
            </div>
          )}

          <div className={`rounded-lg p-4 mb-4 ${
            result.safe 
              ? 'bg-emerald-500/10 border border-emerald-500/30' 
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <div className="flex items-start gap-3">
              {result.safe ? (
                <CheckCircle className="h-6 w-6 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 ${
                  result.safe ? 'text-emerald-300' : 'text-red-300'
                }`}>
                  {result.safe ? '✅ Safe to Deploy' : '❌ Risky Deployment'}
                </h3>
                <p className={`text-sm ${
                  result.safe ? 'text-emerald-400/90' : 'text-red-400/90'
                }`}>
                  {result.summary}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-ag-bg border border-white/5 rounded-lg p-4">
              <div className="text-sm text-ag-muted mb-1">Total Tested</div>
              <div className="text-2xl font-bold text-ag-text">{result.total_tested}</div>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-4">
              <div className="text-sm text-emerald-400/80 mb-1">Passed</div>
              <div className="text-2xl font-bold text-emerald-400">{result.passed}</div>
            </div>
            <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4">
              <div className="text-sm text-red-400/80 mb-1">Failed</div>
              <div className="text-2xl font-bold text-red-400">{result.failed}</div>
            </div>
          </div>

          {result.average_score > 0 && (
            <div className="bg-ag-accent/5 border border-ag-accent/20 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ag-text">Average Score</span>
                <span className="text-lg font-bold text-ag-accent">
                  {result.average_score.toFixed(2)}/5.0
                </span>
              </div>
              {result.score_drop_percentage !== undefined && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-ag-muted">Score Change</span>
                  <span className={`text-sm font-medium ${
                    result.score_drop_percentage < 0 
                      ? 'text-emerald-400' 
                      : result.score_drop_percentage < 15 
                        ? 'text-amber-300' 
                        : 'text-red-400'
                  }`}>
                    {result.score_drop_percentage > 0 ? '+' : ''}
                    {result.score_drop_percentage.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {result.details && result.details.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-ag-text mb-2">Test Details</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.details.slice(0, 10).map((detail, index) => (
                  <div
                    key={index}
                    className="bg-ag-bg border border-white/5 rounded p-3 text-sm"
                  >
                    {detail.snapshot_id && (
                      <div className="font-medium text-ag-text mb-1">
                        Snapshot #{detail.snapshot_id}
                      </div>
                    )}
                    {detail.score !== undefined && (
                      <div className="text-ag-muted">
                        Score: {detail.score.toFixed(2)}/5.0
                      </div>
                    )}
                    {detail.regression_detected && (
                      <div className="flex items-center gap-1 text-red-400 mt-1">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Regression detected</span>
                      </div>
                    )}
                    {detail.reasoning && (
                      <div className="text-ag-muted/70 mt-1 text-xs">
                        {detail.reasoning}
                      </div>
                    )}
                    {detail.error && (
                      <div className="text-red-400 mt-1">
                        Error: {detail.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
