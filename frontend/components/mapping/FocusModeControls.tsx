'use client';

import { useState } from 'react';
import { Focus, X, Home, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface FocusModeControlsProps {
  focusNodeId: string | null;
  depth: number;
  onDepthChange: (depth: number) => void;
  onShowFullGraph: () => void;
  onNodeSelect?: (nodeId: string) => void;
  breadcrumb?: string[];
  className?: string;
}

export default function FocusModeControls({
  focusNodeId,
  depth,
  onDepthChange,
  onShowFullGraph,
  onNodeSelect,
  breadcrumb = [],
  className,
}: FocusModeControlsProps) {
  if (!focusNodeId) {
    return null;
  }

  return (
    <div className={clsx('bg-slate-800 border border-slate-700 rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Focus className="w-5 h-5 text-ag-accent" />
          <h3 className="text-sm font-semibold text-white">Focus Mode</h3>
        </div>
        <button
          onClick={onShowFullGraph}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
        >
          <Home className="w-3 h-3" />
          Show Full Graph
        </button>
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 mb-3 text-xs text-slate-400">
          {breadcrumb.map((nodeId, index) => (
            <div key={nodeId} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="w-3 h-3" />}
              <button
                onClick={() => onNodeSelect?.(nodeId)}
                className="hover:text-white transition-colors"
              >
                {nodeId}
              </button>
            </div>
          ))}
          <ChevronRight className="w-3 h-3" />
          <span className="text-ag-accent font-medium">{focusNodeId}</span>
        </div>
      )}

      {/* Current Focus Node */}
      <div className="mb-3">
        <div className="text-xs text-slate-400 mb-1">Focused Node</div>
        <div className="text-sm font-medium text-white">{focusNodeId}</div>
      </div>

      {/* Depth Control */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">
          Depth: {depth} hop{depth !== 1 ? 's' : ''}
        </label>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={depth}
          onChange={(e) => onDepthChange(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-600"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>1</span>
          <span>5</span>
        </div>
      </div>
    </div>
  );
}
