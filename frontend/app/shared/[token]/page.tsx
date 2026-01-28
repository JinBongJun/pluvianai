'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { sharedResultsAPI } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import ConnectionFailedState from '@/components/states/ConnectionFailedState';
import { CheckCircle, XCircle, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import Button from '@/components/ui/Button';

export default function SharedResultPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is authenticated
    const accessToken = localStorage.getItem('access_token');
    setIsAuthenticated(!!accessToken);

    const fetchShared = async () => {
      try {
        // Guest view - no authentication required
        const data = await sharedResultsAPI.getShared(token!);
        setResult(data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load shared result');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchShared();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ag-bg">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ag-bg p-6">
        <ConnectionFailedState
          title="Shared result not found"
          description={error}
        />
      </div>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <div className="min-h-screen bg-ag-bg p-6 text-ag-text">
      <div className="max-w-4xl mx-auto">
        {/* Guest View Header */}
        <div className="mb-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ag-accent/20 flex items-center justify-center">
                <Lock className="h-5 w-5 text-ag-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-ag-text">Shared Result</h1>
                <p className="text-ag-muted text-sm mt-1">
                  {isAuthenticated ? 'Read-only view' : 'Guest view - Read-only'}
                </p>
              </div>
            </div>
            {!isAuthenticated && (
              <Button
                onClick={() => router.push('/login')}
                className="flex items-center gap-2"
              >
                Sign in for full access
              </Button>
            )}
            {isAuthenticated && result?.project_id && (
              <Button
                onClick={() => router.push(`/dashboard/${result.project_id}`)}
                variant="outline"
                className="flex items-center gap-2"
              >
                Go to Project
              </Button>
            )}
          </div>
        </div>

        {/* Result Content */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {result.result_type === 'model_validation' && 'Model Validation Result'}
            {result.result_type === 'snapshot' && 'Snapshot Details'}
            {result.result_type === 'test' && 'Test Result'}
            {!['model_validation', 'snapshot', 'test'].includes(result.result_type) && 'Result'}
          </h2>

          <div className="space-y-4">
            {result.result_type === 'model_validation' && result.result_data && (
              <div className="space-y-4">
                {/* Model Validation Result Display */}
                <div className={`rounded-lg p-4 ${
                  result.result_data.safe 
                    ? 'bg-green-500/10 border border-green-500/20' 
                    : 'bg-red-500/10 border border-red-500/20'
                }`}>
                  <div className="flex items-start gap-3">
                    {result.result_data.safe ? (
                      <CheckCircle className="h-6 w-6 text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <h3 className={`font-semibold mb-1 ${
                        result.result_data.safe ? 'text-green-300' : 'text-red-300'
                      }`}>
                        {result.result_data.safe ? '✅ Safe to Deploy' : '❌ Risky Deployment'}
                      </h3>
                      <p className={`text-sm ${
                        result.result_data.safe ? 'text-green-200' : 'text-red-200'
                      }`}>
                        {result.result_data.summary}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="text-sm text-slate-400 mb-1">Total Tested</div>
                    <div className="text-2xl font-bold text-white">{result.result_data.total_tested || 0}</div>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-4">
                    <div className="text-sm text-green-400 mb-1">Passed</div>
                    <div className="text-2xl font-bold text-green-300">{result.result_data.passed || 0}</div>
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-4">
                    <div className="text-sm text-red-400 mb-1">Failed</div>
                    <div className="text-2xl font-bold text-red-300">{result.result_data.failed || 0}</div>
                  </div>
                </div>

                {result.result_data.average_score > 0 && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-300">Average Score</span>
                      <span className="text-lg font-bold text-blue-200">
                        {result.result_data.average_score.toFixed(2)}/5.0
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fallback for other result types */}
            {result.result_type !== 'model_validation' && result.result_data && (
              <div className="bg-slate-900 rounded-lg p-4">
                <pre className="text-sm text-slate-300 overflow-x-auto">
                  {JSON.stringify(result.result_data, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {result.created_at && (
            <p className="text-xs text-slate-500 mt-4">
              Shared on {new Date(result.created_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
