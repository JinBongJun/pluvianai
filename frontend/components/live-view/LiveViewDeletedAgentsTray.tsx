"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";

export type LiveViewDeletedAgentRow = {
  agent_id: string;
  display_name?: string;
  total?: number;
  last_seen?: string | null;
  deleted_at?: string | null;
};

export type LiveViewDeletedAgentsTrayProps = {
  readonly agents: LiveViewDeletedAgentRow[];
  readonly restoringAgentId: string | null;
  readonly onRestore: (agentId: string) => void;
  readonly onHardDelete: (agentIds: string[]) => void;
  readonly hardDeleting: boolean;
};

export function LiveViewDeletedAgentsTray({
  agents,
  restoringAgentId,
  onRestore,
  onHardDelete,
  hardDeleting,
}: LiveViewDeletedAgentsTrayProps) {
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(prev => {
      const currentIds = new Set(agents.map(a => a.agent_id));
      const next = new Set<string>();
      prev.forEach(id => {
        if (currentIds.has(id)) next.add(id);
      });
      return next;
    });
    if (agents.length === 0 && isDeleteMode) {
      setIsDeleteMode(false);
    }
  }, [agents, isDeleteMode]);

  const toggleSelected = (agentId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const handleSelectAllOrDeselect = () => {
    if (selectedIds.size === agents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(agents.map(a => a.agent_id)));
    }
  };

  const handleCancel = () => {
    setSelectedIds(new Set());
    setIsDeleteMode(false);
  };

  const handleDelete = () => {
    if (selectedIds.size === 0 || hardDeleting) return;
    onHardDelete(Array.from(selectedIds));
  };

  if (agents.length === 0) return null;

  return (
    <div className="absolute top-6 right-6 z-[60] w-[320px] rounded-2xl border border-amber-500/25 bg-[#141414]/90 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
            Deleted Agents
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Hidden agents can be restored here. Matching new traffic also restores them automatically
            during the configured restore window.
          </p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">
          {agents.length}
        </span>
      </div>
      <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto custom-scrollbar pr-1">
        {agents.map(agent => (
          <div
            key={agent.agent_id}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 flex items-start gap-3"
          >
            {isDeleteMode && (
              <div className="pt-1">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-500 bg-transparent"
                  checked={selectedIds.has(agent.agent_id)}
                  onChange={() => toggleSelected(agent.agent_id)}
                />
              </div>
            )}
            <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {agent.display_name || agent.agent_id}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">{agent.total ?? 0} snapshots</p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {agent.deleted_at
                    ? `Deleted ${new Date(agent.deleted_at).toLocaleString()}`
                    : "Soft-deleted agent"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRestore(agent.agent_id)}
                disabled={restoringAgentId === agent.agent_id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {restoringAgentId === agent.agent_id ? "Restoring..." : "Restore"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {isDeleteMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-[11px] font-bold tracking-[0.12em] text-rose-200 hover:bg-rose-500/25"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSelectAllOrDeselect}
              className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-[11px] font-bold tracking-[0.12em] text-slate-200 hover:bg-white/5"
            >
              {selectedIds.size === agents.length ? "Deselect" : "All"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={hardDeleting || selectedIds.size === 0}
              className="flex-1 rounded-xl border border-rose-500/40 bg-rose-500/25 px-3 py-2 text-[11px] font-bold tracking-[0.12em] text-rose-100 hover:bg-rose-500/40 disabled:opacity-40"
            >
              {hardDeleting
                ? "Deleting..."
                : selectedIds.size === 0
                  ? "Delete"
                  : `Delete (${selectedIds.size})`}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsDeleteMode(true);
              setSelectedIds(new Set());
            }}
            className="w-full rounded-xl border border-rose-500/40 bg-black/40 px-3 py-2 text-[11px] font-bold tracking-[0.12em] text-rose-200 hover:bg-rose-500/20 flex items-center justify-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[11px] leading-relaxed text-slate-400">
          Removal hides an agent immediately. Matching traffic can auto-restore it within the grace
          window. Hard delete permanently purges current Live View data for the selected agents. New
          matching traffic can create them again as fresh agents later.
          <Link href="/docs" className="ml-1 text-emerald-300 hover:text-emerald-200">
            See docs
          </Link>
        </div>
      </div>
    </div>
  );
}
