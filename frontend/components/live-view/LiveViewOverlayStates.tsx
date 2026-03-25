"use client";

export function LiveViewLoadingState() {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#030303]/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-white/10 bg-[#121215]/80 px-6 py-5 text-center shadow-2xl">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-400">
          Loading Live View
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Fetching agents and snapshots for this project...
        </p>
      </div>
    </div>
  );
}

export type LiveViewErrorStateProps = {
  readonly title: string;
  readonly description: string;
  readonly onRetry: () => void;
};

export function LiveViewErrorState({ title, description, onRetry }: LiveViewErrorStateProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#030303]/70 backdrop-blur-sm px-6">
      <div className="w-full max-w-xl rounded-2xl border border-rose-500/30 bg-[#141016]/90 p-6 text-center shadow-2xl">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">{title}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{description}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
