"use client";

import Link from "next/link";

import type { SnapshotDetailFixtureCase } from "@/lib/test-fixtures/snapshot-detail";
import { SnapshotDetailModal } from "@/components/shared/SnapshotDetailModal";

type FixtureViewerProps = {
  activeCase: SnapshotDetailFixtureCase;
  allCases: SnapshotDetailFixtureCase[];
};

export default function FixtureViewer({ activeCase, allCases }: FixtureViewerProps) {
  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="relative z-[1201] rounded-2xl border border-white/10 bg-black/40 p-4 shadow-2xl">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">
                Snapshot Detail Fixture Playground
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Active fixture:{" "}
                <span className="font-mono text-emerald-300">{activeCase.id}</span>
              </p>
              <p className="mt-1 text-sm text-slate-300">{activeCase.notes}</p>
            </div>
            <div className="text-xs text-slate-500">
              Public fixture page for deterministic Playwright coverage.
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {allCases.map(item => {
              const isActive = item.id === activeCase.id;
              return (
                <Link
                  key={item.id}
                  href={`/test/snapshot-detail-fixtures?case=${encodeURIComponent(item.id)}`}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    isActive
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white",
                  ].join(" ")}
                >
                  {item.id}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pb-10">
        <SnapshotDetailModal
          snapshot={activeCase.snapshot}
          onClose={() => {}}
          overlayZIndex={1100}
        />
      </div>
    </main>
  );
}
