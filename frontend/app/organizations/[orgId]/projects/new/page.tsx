"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useSWRConfig } from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { projectsAPI, organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import { analytics } from "@/lib/analytics";
import { useToast } from "@/components/ToastContainer";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import { revalidateOrganizationProjectLists } from "@/lib/orgProjectMutations";

type UsageMode = "full" | "test_only";

export default function NewProjectPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { orgId } = useOrgProjectParams();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanLimitError | null>(null);

  const { data: org } = useSWR(orgId ? orgKeys.detail(orgId) : null, () =>
    organizationsAPI.get(orgId, { includeStats: false })
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    setLoading(true);
    setError(null);
    setPlanError(null);

    try {
      const project = await projectsAPI.create({
        name: name.trim(),
        description: description.trim() || undefined,
        organization_id: Number(orgId),
        usage_mode: "full", // Defaulting to full mode as UI selection is removed
      });

      // Track project creation event
      analytics.capture("project_created", {
        project_id: project.id,
        organization_id: Number(orgId),
        has_description: !!description.trim(),
        usage_mode: "full",
      });

      toast.showToast("Project created successfully", "success");
      await revalidateOrganizationProjectLists(mutate, orgId);
      router.push(`/organizations/${orgId}/projects/${project.id}`);
    } catch (err: any) {
      const parsed = parsePlanLimitError(err);
      if (parsed && parsed.code === "PROJECT_LIMIT_REACHED") {
        setPlanError(parsed);
        setError(null);
      } else {
        const detail = err?.response?.data?.detail;
        const message =
          (typeof detail === "string" ? detail : detail?.message) ||
          err?.message ||
          "Failed to create project";
        setError(message);
        toast.showToast(message, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!orgId) {
    return null;
  }

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: "Organizations", href: "/organizations" },
        { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
        { label: "New Project" },
      ]}
    >
      <div className="max-w-2xl mx-auto pt-20 pb-32 relative z-10">
        <div className="mb-10 flex items-center gap-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)] shrink-0">
            <span className="text-[11px] font-black uppercase tracking-widest">Init</span>
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-2 text-white leading-none">
              New Project
            </h1>
            <p className="text-base font-medium text-slate-400 max-w-xl leading-relaxed">
              Create a project for LLM trace monitoring and policy enforcement.
            </p>
          </div>
        </div>

        {planError && (
          <div className="mb-8">
            <PlanLimitBanner {...planError} context="project" />
          </div>
        )}
        {error && !planError && (
          <div className="mb-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 flex items-start gap-4 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
            <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-rose-400 mb-1">
                Initialization Failure
              </h4>
              <p className="text-sm text-rose-300/80 leading-relaxed font-medium">{error}</p>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="relative space-y-10 bg-[#1a1a1e]/95 border border-white/[0.15] p-10 md:p-12 rounded-[40px] backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden"
        >
          {/* Top Rim Highlight (Persistent) */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100 z-10" />
          <div className="absolute top-[1px] inset-x-10 h-16 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none z-10" />

          {/* Internal Inner Glow Layer */}
          <div className="absolute inset-0.5 rounded-[38px] bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />

          <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

          <div className="relative z-10 space-y-8">
            <div>
              <label
                htmlFor="name"
                className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4 ml-2"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                Project Designation
              </label>
              <div className="relative group/input">
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. CORE-SYSTEM-A"
                  required
                  className="w-full rounded-2xl border border-white/20 bg-[#0a0a0c]/80 px-6 py-4 text-lg font-black text-white placeholder:text-slate-600 focus:border-emerald-500/60 focus:bg-[#0a0a0c]/90 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                />
                <div className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-focus-within/input:opacity-100 transition-opacity" />
              </div>
              <p className="mt-4 text-[11px] text-slate-600 font-bold uppercase tracking-widest ml-2">
                A unique namespace for this implementation.
              </p>
            </div>

            <div>
              <label
                htmlFor="description"
                className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4 ml-2"
              >
                <div className="w-2 h-2 rounded-full bg-slate-600" />
                Description (optional)
              </label>
              <div className="relative group/input">
                <textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Outline the operational parameters and objectives..."
                  rows={4}
                  className="w-full rounded-2xl border border-white/20 bg-[#0a0a0c]/80 px-6 py-4 text-lg font-black text-white placeholder:text-slate-600 focus:border-emerald-500/60 focus:bg-[#0a0a0c]/90 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                />
                <div className="absolute inset-x-6 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-focus-within/input:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-8 border-t border-white/5 relative z-10 mt-8">
            <button
              type="button"
              onClick={() => router.push(`/organizations/${orgId}/projects`)}
              className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="h-14 px-10 rounded-full font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed
                bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)] text-sm
              "
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </OrgLayout>
  );
}
