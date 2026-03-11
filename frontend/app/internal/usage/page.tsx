"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { internalUsageAPI } from "@/lib/api";

type ProjectUsageItem = {
  project_id: number | null;
  project_name: string | null;
  owner_email: string | null;
  total_credits: number;
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
  const router = useRouter();
  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [data, setData] = useState<ProjectUsageResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
    });
    return label;
  }, [month]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = (await internalUsageAPI.getGuardCreditsByProject(
          month
        )) as ProjectUsageResponse;
        setData(result);
      } catch (err: any) {
        console.error("Failed to load platform replay credit usage:", err);
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
  }, [month, router]);

  const items = data?.items ?? [];

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Platform replay credit usage</h1>
            <p className="text-sm text-slate-400 mt-1">
              Internal dashboard to monitor hosted replay credit exposure per project.{" "}
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

        {error && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4 shadow-lg shadow-black/40">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Projects by platform replay credits used
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
                  <th className="px-3 py-2 text-right">Replay credits</th>
                  <th className="px-3 py-2 text-right">Replay runs</th>
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
                      No platform replay credit usage recorded for this month.
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
                        {item.total_credits.toLocaleString()}
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
