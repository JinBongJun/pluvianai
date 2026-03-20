"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import TopHeader from "@/components/layout/TopHeader";
import { authAPI, organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Plus, Search, Building2, Briefcase } from "lucide-react";
import { clsx } from "clsx";

export default function OrganizationsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const isAuthenticated = useRequireAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadUser = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setUserEmail(user?.email || "");
        setUserName(user?.full_name || "");
        setAuthReady(true);
      } catch (error) {
        console.error("🔴 [OrganizationsPage] Error in loadUser:", error);
        router.push("/login?reauth=1");
      }
    };

    void loadUser();
  }, [isAuthenticated, router]);

  // Same SWR key as TopHeader so one request only (no duplicate 401)
  const { data: orgs, mutate } = useSWR(authReady ? orgKeys.list() : null, () =>
    organizationsAPI.list({ includeStats: false })
  );

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(org => org.name.toLowerCase().includes(q));
  }, [debouncedQuery, orgs]);

  return (
    <div className="min-h-screen text-white selection:bg-emerald-500/30 font-sans relative">
      {/* Global Antigravity Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#030303]">
        {/* Deep space radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-50" />

        {/* Starry Dust Layer 1 (Dense & Small) */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjE1KSIvPjxjaXJjbGUgY3g9IjE4MCIgY3k9IjEyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PGNpcmNsZSBjeD0iMzIwIiBjeT0iODAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjMyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjI1KSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iMjgwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMTUpIi8+PGNpcmNsZSBjeD0iMzcwIiBjeT0iMjIwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] bg-[size:300px_300px] opacity-60" />

        {/* Starry Dust Layer 2 (Sparse & Bright) */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMTUwIiBjeT0iMTUwIiByPSIyIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMykiLz48Y2lyY2xlIGN4PSI2NTAiIGN5PSI0NTAiIHI9IjEuNSIgZmlsbD0icmdiYSg2LDE4MiwyMTIsMC41KSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjY1MCIgcj0iMiIgZmlsbD0icmdiYSgxNiwxODUsMTI5LDAuNCkiLz48Y2lyY2xlIGN4PSI1NTAiIGN5PSIyNTAiIHI9IjIuNSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PC9zdmc+')] bg-[size:800px_800px] opacity-80" />

        {/* Photographic Light Leaks & Lens Flares */}
        <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[10%] w-[600px] h-[600px] bg-emerald-900/20 blur-[150px] rounded-full pointer-events-none mix-blend-screen" />

        {/* Anamorphic Flare Line */}
        <div className="absolute top-[40%] left-[-10%] w-[120%] h-[2px] bg-cyan-500/30 blur-[2px] -rotate-12 pointer-events-none mix-blend-screen" />
        <div className="absolute top-[40%] left-[-10%] w-[120%] h-[20px] bg-cyan-500/10 blur-[20px] -rotate-12 pointer-events-none mix-blend-screen" />

        {/* Floating Particles (Photographic depth) */}
        <div className="absolute top-[15%] left-[15%] w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.8)] opacity-80" />
        <div className="absolute top-[30%] left-[20%] w-3 h-3 rounded-full bg-emerald-300 blur-[1px] shadow-[0_0_15px_3px_rgba(16,185,129,0.6)] opacity-60" />
        <div className="absolute top-[20%] right-[18%] w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_2px_rgba(6,182,212,0.8)] opacity-90" />
        <div className="absolute bottom-[25%] left-[25%] w-2.5 h-2.5 rounded-full bg-cyan-300 blur-[1px] shadow-[0_0_12px_2px_rgba(6,182,212,0.8)] opacity-70" />
        <div className="absolute bottom-[35%] right-[15%] w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.8)] opacity-80" />
      </div>

      <TopHeader userName={userName} userEmail={userEmail} />

      <main className="pt-36 pb-16 px-6 w-full max-w-7xl mx-auto relative z-10 space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Your Organizations
          </h1>

          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-500 transition-colors z-20">
                <Search className="w-5 h-5" />
              </div>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search for an authorized laboratory"
                className="w-full h-12 pl-12 pr-6 bg-[#0a0a0c]/80 backdrop-blur-2xl border border-white/[0.15] rounded-full text-base font-medium text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 hover:border-white/30 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
              />
              <div className="absolute inset-x-8 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity" />
            </div>

            <button
              onClick={() => router.push("/organizations/new")}
              className="h-12 px-6 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold rounded-full shadow-[0_0_40px_-5px_rgba(16,185,129,0.5)] transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest whitespace-nowrap relative group/btn overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
              <div className="relative z-10 flex items-center gap-3">
                <Plus className="w-5 h-5 stroke-[3px]" />
                <span>New organization</span>
              </div>
            </button>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {filtered.map(org => (
            <div
              key={org.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/organizations/${org.id}/projects`)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/organizations/${org.id}/projects`);
                }
              }}
              className="group relative p-6 rounded-xl bg-[#1a1a1e]/95 backdrop-blur-3xl border border-white/[0.15] transition-all duration-500 hover:border-emerald-500/40 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] hover:shadow-[0_0_60px_rgba(16,185,129,0.1)] overflow-hidden flex items-center gap-6 text-left active:scale-[0.99] cursor-pointer"
            >
              {/* Top Rim Highlight (Persistent) */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100 z-10" />
              <div className="absolute top-[1px] inset-x-10 h-16 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none z-10" />

              {/* Internal Inner Glow Layer */}
              <div className="absolute inset-0.5 rounded-[38px] bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />

              {/* Bottom Right Glow Element */}
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500 pointer-events-none" />

              {/* Top Right Arrow Button */}
              <div className="absolute top-6 right-6 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-black opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] z-10 group-hover:scale-105">
                <svg
                  className="w-5 h-5 -rotate-45"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </div>

              <div className="relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center bg-white/[0.05] border border-white/10 group-hover:scale-110 group-hover:border-emerald-500/40 group-hover:bg-emerald-500/5 transition-all duration-500 text-emerald-400 flex-shrink-0 shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]">
                <Building2 className="w-8 h-8 stroke-[1.5px]" />
              </div>

              <div className="relative z-10 flex-1">
                <h3 className="text-2xl font-semibold text-white mb-3 tracking-tight uppercase group-hover:text-emerald-50 transition-colors leading-none">
                  {org.name}
                </h3>
                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`/organizations/${org.id}/billing`);
                    }}
                    className="bg-emerald-500/15 text-emerald-400 px-4 py-2 rounded-full border border-emerald-500/30 flex items-center gap-2.5 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:bg-emerald-500/25 hover:border-emerald-500/60 transition-colors"
                    title="View usage & change plan"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,1)]" />
                    {org.plan || "Free"} Plan
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(`/organizations/${org.id}/projects`);
                    }}
                    className="flex items-center gap-2.5 group-hover:text-slate-200 transition-colors bg-white/5 px-4 py-2 rounded-full border border-white/10 shadow-sm hover:bg-white/10 hover:border-emerald-500/40"
                    title="View projects in this organization"
                  >
                    <Briefcase className="w-4 h-4 text-slate-500 group-hover:text-emerald-500 transition-colors" />
                    {org.projects || 0} Projects
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-white/5 rounded-xl bg-white/[0.01]">
              <p className="text-slate-600 text-lg font-semibold uppercase tracking-widest">
                No Organizations found.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
