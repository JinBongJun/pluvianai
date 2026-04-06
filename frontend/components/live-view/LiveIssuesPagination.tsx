"use client";

type LiveIssuesPaginationProps = {
  loadedCount: number;
  totalCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
};

export function LiveIssuesPagination({
  loadedCount,
  totalCount,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
}: LiveIssuesPaginationProps) {
  if (totalCount <= 0) return null;

  return (
    <div className="border-t border-white/[0.06] bg-[#18191e] px-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-400">
          {hasMore ? `Loaded ${loadedCount} of ${totalCount} snapshots` : "All snapshots loaded"}
        </div>

        <div className="flex items-center gap-3">
          {loadMoreError ? (
            <span className="text-xs font-medium text-rose-300">{loadMoreError}</span>
          ) : null}
          {hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingMore ? "Loading older snapshots..." : "Load older"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
