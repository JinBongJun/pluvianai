'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

interface DeltaViewerProps {
  modelA: {
    name: string;
    response: string;
    score?: number;
    reasoning?: string;
  };
  modelB: {
    name: string;
    response: string;
    score?: number;
    reasoning?: string;
  };
  judgeFeedback?: {
    regression_detected?: boolean;
    original_score?: number;
    replayed_score?: number;
    reasoning?: string;
  };
  className?: string;
}

export default function DeltaViewer({
  modelA,
  modelB,
  judgeFeedback,
  className,
}: DeltaViewerProps) {
  const [selectedView, setSelectedView] = useState<'side-by-side' | 'diff'>('side-by-side');

  // Simple semantic diff - highlight differences
  const highlightDifferences = (textA: string, textB: string): { a: string; b: string } => {
    // Simple word-level diff (for MVP)
    // In production, use a proper diff library like diff-match-patch
    const wordsA = textA.split(/\s+/);
    const wordsB = textB.split(/\s+/);
    
    // Find common subsequence (simplified)
    const maxLen = Math.max(wordsA.length, wordsB.length);
    const highlightedA: string[] = [];
    const highlightedB: string[] = [];
    
    for (let i = 0; i < maxLen; i++) {
      const wordA = wordsA[i] || '';
      const wordB = wordsB[i] || '';
      
      if (wordA === wordB) {
        highlightedA.push(wordA);
        highlightedB.push(wordB);
      } else {
        highlightedA.push(`<mark class="bg-red-500/20 text-red-300">${wordA}</mark>`);
        highlightedB.push(`<mark class="bg-green-500/20 text-green-300">${wordB}</mark>`);
      }
    }
    
    return {
      a: highlightedA.join(' '),
      b: highlightedB.join(' '),
    };
  };

  const diff = highlightDifferences(modelA.response, modelB.response);

  return (
    <div className={clsx('rounded-xl border border-white/10 bg-white/5 p-6', className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Model Comparison</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedView('side-by-side')}
            className={clsx(
              'px-3 py-1.5 rounded text-sm transition-colors',
              selectedView === 'side-by-side'
                ? 'bg-ag-primary text-ag-accent-light'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
          >
            Side-by-Side
          </button>
          <button
            onClick={() => setSelectedView('diff')}
            className={clsx(
              'px-3 py-1.5 rounded text-sm transition-colors',
              selectedView === 'diff'
                ? 'bg-ag-primary text-ag-accent-light'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
          >
            Diff View
          </button>
        </div>
      </div>

      {selectedView === 'side-by-side' ? (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Model A */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-white">{modelA.name}</h4>
              {modelA.score !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Score:</span>
                  <span className="text-lg font-bold text-white">{modelA.score.toFixed(1)}</span>
                </div>
              )}
            </div>
            <div className="prose prose-invert max-w-none">
              <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">
                {modelA.response}
              </p>
            </div>
            {modelA.reasoning && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-xs text-slate-400">{modelA.reasoning}</p>
              </div>
            )}
          </div>

          {/* Model B */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-white">{modelB.name}</h4>
              {modelB.score !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Score:</span>
                  <span className="text-lg font-bold text-white">{modelB.score.toFixed(1)}</span>
                  {judgeFeedback?.regression_detected && modelB.score < (modelA.score || 0) && (
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  )}
                </div>
              )}
            </div>
            <div className="prose prose-invert max-w-none">
              <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">
                {modelB.response}
              </p>
            </div>
            {modelB.reasoning && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-xs text-slate-400">{modelB.reasoning}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Diff View */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-red-500/20">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="h-4 w-4 text-red-400" />
                <h4 className="font-semibold text-red-300">{modelA.name}</h4>
              </div>
              <div
                className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: diff.a }}
              />
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-green-500/20">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <h4 className="font-semibold text-green-300">{modelB.name}</h4>
              </div>
              <div
                className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: diff.b }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Judge Feedback */}
      {judgeFeedback && (
        <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-white/5">
          <div className="flex items-start gap-3">
            {judgeFeedback.regression_detected ? (
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="font-semibold text-white mb-2">AI Judge Evaluation</h4>
              {judgeFeedback.original_score !== undefined && judgeFeedback.replayed_score !== undefined && (
                <div className="flex items-center gap-4 mb-2">
                  <div>
                    <span className="text-xs text-slate-400">Original:</span>
                    <span className="ml-2 text-sm font-medium text-white">
                      {judgeFeedback.original_score.toFixed(1)}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                  <div>
                    <span className="text-xs text-slate-400">Replayed:</span>
                    <span
                      className={clsx(
                        'ml-2 text-sm font-medium',
                        judgeFeedback.replayed_score < judgeFeedback.original_score
                          ? 'text-red-400'
                          : 'text-green-400'
                      )}
                    >
                      {judgeFeedback.replayed_score.toFixed(1)}
                    </span>
                  </div>
                </div>
              )}
              {judgeFeedback.reasoning && (
                <p className="text-sm text-slate-300 mt-2">{judgeFeedback.reasoning}</p>
              )}
              {judgeFeedback.regression_detected && (
                <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-300">
                  ⚠️ Regression detected: Quality decreased
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Score Comparison */}
      {modelA.score !== undefined && modelB.score !== undefined && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">{modelA.name}</div>
            <div className="text-2xl font-bold text-white">{modelA.score.toFixed(1)}</div>
          </div>
          <ArrowRight className="h-6 w-6 text-slate-500" />
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">{modelB.name}</div>
            <div
              className={clsx(
                'text-2xl font-bold',
                modelB.score < modelA.score ? 'text-red-400' : 'text-green-400'
              )}
            >
              {modelB.score.toFixed(1)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">Change</div>
            <div
              className={clsx(
                'text-lg font-semibold',
                modelB.score < modelA.score ? 'text-red-400' : 'text-green-400'
              )}
            >
              {modelB.score >= modelA.score ? '+' : ''}
              {(modelB.score - modelA.score).toFixed(1)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
