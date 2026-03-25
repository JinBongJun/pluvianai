"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useSWRConfig } from "swr";
import TopHeader from "@/components/layout/TopHeader";
import { createOrganization } from "@/lib/orgProjectMutations";
import { Beaker, ArrowLeft, Building2, Shield, Activity, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";

export default function NewOrganizationPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanLimitError | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Organization name is required");
      return;
    }
    setLoading(true);
    setError(null);
    setPlanError(null);
    try {
      await createOrganization(
        {
          name: name.trim(),
          description: description.trim() || null,
          plan_type: "free",
        },
        { mutate, router }
      );
    } catch (err: any) {
      const parsed = parsePlanLimitError(err);
      if (parsed && parsed.code === "ORG_LIMIT_REACHED") {
        setPlanError(parsed);
        setError(null);
      } else {
        const detail = err?.response?.data?.detail;
        const message =
          (typeof detail === "string" ? detail : detail?.message) ||
          err?.message ||
          "Failed to create organization";
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Global Antigravity Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#030303]">
        {/* Deep space radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-50" />

        {/* 1. Global Diagonal Curtain Lights */}
        <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[500px] bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent -rotate-[35deg] blur-[100px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[20%] left-[-20%] w-[150%] h-[600px] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent -rotate-[35deg] blur-[120px] pointer-events-none mix-blend-screen" />

        {/* 2. Geometric Light Beams */}
        <div className="absolute top-1/2 -left-[20%] w-[40%] h-[120%] -translate-y-1/2 rounded-[100%] pointer-events-none opacity-40 border-r-[2px] border-cyan-400/30 bg-gradient-to-l from-cyan-500/20 via-transparent to-transparent shadow-[inset_-20px_0_100px_rgba(34,211,238,0.2)] mix-blend-screen" />
        <div className="absolute top-1/2 -right-[20%] w-[40%] h-[120%] -translate-y-1/2 rounded-[100%] pointer-events-none opacity-30 border-l-[2px] border-emerald-400/30 bg-gradient-to-r from-emerald-500/20 via-transparent to-transparent shadow-[inset_20px_0_100px_rgba(16,185,129,0.2)] mix-blend-screen" />

        {/* 3. High-Density Floating Particles */}
        <div className="absolute top-[10%] left-[30%] w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
        <div className="absolute top-[40%] right-[15%] w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-bounce duration-[3000ms]" />
        <div className="absolute bottom-[10%] right-[30%] w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />

        {/* 4. Vector Capsules for Depth */}
        <div className="absolute top-[100px] -left-[100px] w-[300px] h-[600px] border-[1px] border-white/10 rounded-r-full opacity-20 pointer-events-none" />
        <div className="absolute bottom-[100px] -right-[150px] w-[400px] h-[800px] border-[1px] border-white/5 rounded-l-full opacity-30 pointer-events-none" />

        {/* Localized Stage Light for Form */}
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
      </div>

      <TopHeader
        breadcrumb={[
          { label: "Organizations", href: "/organizations" },
          { label: "New Organization" },
        ]}
      />

      <main className="px-8 pt-32 pb-32 max-w-3xl mx-auto relative z-10">
        <button
          onClick={() => router.push("/organizations")}
          className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-[10px] font-black uppercase tracking-[0.3em] mb-12 group shadow-lg"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1.5 transition-transform stroke-[3px]" />
          <span>Back to Organizations</span>
        </button>

        <div className="mb-12">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-6 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <Plus className="w-3.5 h-3.5 stroke-[3px]" />
            New Organization
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase mb-6 leading-none">
            Create <span className="text-emerald-500">Organization</span>
          </h1>
          <p className="text-slate-400 text-base font-medium max-w-xl leading-relaxed">
            Create an organization to manage agent projects, usage, and billing.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="relative space-y-10 bg-[#1a1a1e]/95 border border-white/[0.15] p-10 md:p-12 rounded-[40px] backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden"
        >
          {/* Top Rim Highlight (Persistent) */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100 z-10" />
          <div className="absolute top-[1px] inset-x-10 h-16 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none z-10" />

          {/* Internal Inner Glow Layer */}
          <div className="absolute inset-0.5 rounded-[38px] bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />

          <div className="space-y-4 relative z-10">
            <label
              htmlFor="org-name"
              className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] ml-2"
            >
              Organization Name <span className="text-emerald-500">*</span>
            </label>
            <div className="relative group/input">
              <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-500 group-focus-within/input:text-emerald-400 transition-colors">
                <Building2 className="h-5 w-5 stroke-[1.5px]" />
              </div>
              <input
                id="org-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full pl-14 pr-6 py-4 bg-[#0a0a0c]/80 border border-white/20 rounded-2xl text-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 transition-all font-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                required
                maxLength={255}
              />
              <div className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-focus-within/input:opacity-100 transition-opacity" />
            </div>
            <p className="text-[11px] text-slate-600 font-bold uppercase tracking-widest ml-2">
              Primary identifier for this organization in PluvianAI.
            </p>
          </div>

          <div className="space-y-4 relative z-10">
            <label
              htmlFor="org-description"
              className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] ml-2"
            >
              Description (optional)
            </label>
            <div className="relative group/input">
              <textarea
                id="org-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of this organization (optional)."
                rows={4}
                className="w-full px-8 py-5 bg-[#0a0a0c]/80 border border-white/20 rounded-2xl text-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 transition-all font-black resize-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                maxLength={2000}
              />
              <div className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-focus-within/input:opacity-100 transition-opacity" />
            </div>
          </div>

          {planError && <PlanLimitBanner {...planError} context="organization" className="mb-4" />}
          {error && !planError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 animate-shake space-y-3">
              <p className="text-xs font-bold text-red-400 uppercase tracking-wider">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-8 pt-8 relative z-10 border-t border-white/5 mt-8">
            <button
              type="button"
              onClick={() => router.push("/organizations")}
              className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-all"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={!name.trim() || loading}
              className="h-14 px-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)] transition-all flex items-center gap-3 group/btn hover:scale-[1.05] active:scale-[0.98]"
            >
              <span className="text-base">{loading ? "Creating..." : "Create Organization"}</span>
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
