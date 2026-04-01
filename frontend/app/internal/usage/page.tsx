"use client";

import { useEffect, useMemo, useState } from "react";
import { internalUsageAPI } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { logger } from "@/lib/logger";

type ProjectUsageItem = {
  project_id: number | null;
  project_name: string | null;
  owner_email: string | null;
  total_attempts: number;
  runs: number;
};

type ProjectUsageResponse = {
  month: string;
  items: ProjectUsageItem[];
};

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function InternalUsagePage() {
  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [data, setData] = useState<ProjectUsageResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isAuthenticated = useRequireAuth();

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
    });
    return label;
  }, [month]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = (await internalUsageAPI.getReleaseGateAttemptsByProject(
          month
        )) as ProjectUsageResponse;
        setData(result);
      } catch (err: any) {
        logger.error("Failed to load Release Gate attempt usage", err);
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Failed to load usage data. This page is for admin/internal use."
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isAuthenticated, month]);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const totalAttempts = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.total_attempts || 0), 0),
    [items]
  );
  const totalRunJobs = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.runs || 0), 0),
    [items]
  );
  const activeProjects = items.length;

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Release Gate usage</h1>
            <p className="text-sm text-slate-400 mt-1">
              Internal dashboard to monitor replay attempts and run volume per project.{" "}
              <span className="font-medium text-slate-300">
                Month: <span className="text-sky-300">{monthLabel}</span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400" htmlFor="month-input">
              Month
            </label>
            <input
              id="month-input"
              type="month"
              className="rounded-md border border-white/10 bg-slate-900/80 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={month}
              onChange={e => setMonth(e.target.value)}
            />
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Replay Attempts</p>
            <p className="mt-1 text-2xl font-semibold text-sky-300">
              {loading ? "..." : totalAttempts.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Run Jobs</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {loading ? "..." : totalRunJobs.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Active Projects</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {loading ? "..." : activeProjects.toLocaleString()}
            </p>
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4 shadow-lg shadow-black/40">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Projects by replay attempts used
            </h2>
            <span className="text-xs text-slate-500">
              {loading
                ? "Loading..."
                : items.length
                  ? `${items.length} project${items.length > 1 ? "s" : ""}`
                  : "No usage for this month"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs uppercase text-slate-400">
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2 text-right">Replay attempts</th>
                  <th className="px-3 py-2 text-right">Run jobs</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>
                      Loading usage...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>
                      No Release Gate usage recorded for this month.
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr
                      key={`project-${item.project_id ?? "none"}`}
                      className="border-b border-white/5"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-100">
                          {item.project_name || "(no project name)"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.project_id != null ? `ID ${item.project_id}` : "No project_id"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-sm text-slate-200">
                          {item.owner_email || "(no owner email)"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.total_attempts.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-200">
                        {item.runs.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
