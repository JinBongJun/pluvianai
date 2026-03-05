"use client";

import { useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { projectsAPI, organizationsAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import posthog from "posthog-js";

type UsageMode = "full" | "test_only";

export default function NewProjectPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: org } = useSWR(orgId ? ["organization", orgId] : null, () =>
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

    try {
      const project = await projectsAPI.create({
        name: name.trim(),
        description: description.trim() || undefined,
        organization_id: Number(orgId),
        usage_mode: "full", // Defaulting to full mode as UI selection is removed
      });

      // Track project creation event
      posthog.capture("project_created", {
        project_id: project.id,
        organization_id: Number(orgId),
        has_description: !!description.trim(),
        usage_mode: "full",
      });

      toast.showToast("Project created successfully", "success");
      router.push(`/organizations/${orgId}/projects/${project.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Failed to create project");
      toast.showToast(err.response?.data?.detail || "Failed to create project", "error");
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
        { label: "New Protocol" },
      ]}
    >
      <div className="max-w-2xl mx-auto py-8">
        <div className="mb-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <span className="text-[10px] font-black uppercase tracking-widest">Init</span>
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-widest mb-2 text-white">Initialize Project Protocol</h1>
            <p className="text-sm font-medium text-slate-400">Establish a new compartmentalized secure zone for LLM trace monitoring and policy enforcement.</p>
          </div>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 flex items-start gap-4 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
            <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-rose-400 mb-1">Initialization Failure</h4>
              <p className="text-sm text-rose-300/80 leading-relaxed font-medium">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8 rounded-3xl border border-white/10 bg-slate-900/40 p-10 backdrop-blur-2xl relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

          <div className="relative z-10 space-y-8">
            <div>
              <label htmlFor="name" className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-300 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                Project Designation
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. CORE-SYSTEM-A"
                required
                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-5 py-4 text-base font-medium text-white placeholder:text-slate-500 focus:border-emerald-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
              />
              <p className="mt-3 text-sm text-slate-400">
                A unique namespace for this implementation.
              </p>
            </div>

            <div>
              <label htmlFor="description" className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-300 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Protocol Briefing (Optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Outline the operational parameters and objectives..."
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-5 py-4 text-base font-medium text-white placeholder:text-slate-500 focus:border-emerald-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all resize-none shadow-inner"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-8 border-t border-white/10 relative z-10">
            <button
              type="button"
              onClick={() => router.push(`/organizations/${orgId}/projects`)}
              className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              Abort
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed
                bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)]
              "
            >
              {loading ? "INITIALIZING..." : "COMMENCE PROTOCOL"}
            </button>
          </div>
        </form>
      </div>
    </OrgLayout>
  );
}
