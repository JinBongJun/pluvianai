'use client';

import React, { useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { AgentPickerCard } from './AgentPickerCard';
import type { AgentForPicker } from './AgentPickerCard';

type AgentNodePickerModalProps = {
  open: boolean;
  onClose: () => void;
  agents: AgentForPicker[];
  loading: boolean;
  onSelect: (agent: AgentForPicker) => void;
};

export function AgentNodePickerModal({
  open,
  onClose,
  agents,
  loading,
  onSelect,
}: AgentNodePickerModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-picker-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#111216] shadow-2xl">
        <div className="flex items-center justify-between shrink-0 px-5 py-4 border-b border-white/10">
          <h2 id="agent-picker-title" className="text-base font-bold text-white">
            Select agent (Live View node)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-500" aria-hidden />
            </div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              No agents yet. Run flows in Live View to see nodes here.
            </p>
          ) : (
            agents.map((agent) => (
              <AgentPickerCard
                key={agent.agent_id}
                agent={agent}
                onSelect={() => {
                  onSelect(agent);
                  onClose();
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
