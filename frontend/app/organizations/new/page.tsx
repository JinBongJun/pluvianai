"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import TopHeader from "@/components/layout/TopHeader";
import { organizationsAPI } from "@/lib/api";
import { Beaker, ArrowLeft, Building2, Shield, Activity, Plus } from "lucide-react";
import Button from "@/components/ui/Button";

export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Organization name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const org = await organizationsAPI.create({
        name: name.trim(),
        description: description.trim() || null,
        plan_type: "free",
      });
      router.push(`/organizations/${org.id}/projects`);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail || err?.message || "Failed to create organization";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white selection:bg-emerald-500/30">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_30%_30%,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent pointer-events-none" />

      <TopHeader
        breadcrumb={[
          { label: "Atomic Lab", href: "/organizations" },
          { label: "Initialize New Lab" },
        ]}
      />

      <main className="px-8 py-16 max-w-2xl mx-auto relative z-10">
        <button
          onClick={() => router.push("/organizations")}
          className="flex items-center gap-2 text-slate-500 hover:text-emerald-400 transition-colors text-xs font-bold uppercase tracking-widest mb-8 group"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
          Back to Select
        </button>

        <div className="space-y-2 mb-10">
          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-2">
            <Plus className="w-3 h-3" />
            Lab Initialization
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white italic">
            Create New Laboratory
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            Initialize a dedicated organization for agent validation, security scoring, and logic
            signaling.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8 bg-slate-900/40 border border-slate-800 p-8 rounded-3xl backdrop-blur-sm"
        >
          <div className="space-y-2">
            <label
              htmlFor="org-name"
              className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1"
            >
              Lab Name <span className="text-emerald-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <Building2 className="h-4 w-4" />
              </div>
              <input
                id="org-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Acme Research Lab"
                className="w-full pl-11 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                required
                maxLength={255}
              />
            </div>
            <p className="text-[11px] text-slate-600 font-medium ml-1">
              This is the identifier for your clinical environment.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="org-description"
              className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1"
            >
              Mission Description
            </label>
            <textarea
              id="org-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Define the primary research focus of this lab..."
              rows={4}
              className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium resize-none"
              maxLength={2000}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-bold text-red-400 uppercase tracking-wider animate-shake">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.push("/organizations")}
              className="px-6 py-2.5 rounded-xl text-slate-500 hover:text-white text-sm font-bold transition-all"
            >
              Abuse Initialization
            </button>
            <Button
              type="submit"
              disabled={!name.trim() || loading}
              className="px-8 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all flex items-center gap-2 group"
            >
              {loading ? "Initializing..." : "Initialize Lab"}
              <Beaker className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            </Button>
          </div>
        </form>

        <div className="mt-12 grid grid-cols-2 gap-6 opacity-40 grayscale group-hover:grayscale-0 transition-all">
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/20">
            <Shield className="w-5 h-5 text-emerald-500 mb-2" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Validated Isolation
            </h4>
            <p className="text-[10px] text-slate-600 leading-relaxed mt-1">
              Each lab operates in a hermetically sealed data environment.
            </p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/20">
            <Activity className="w-5 h-5 text-cyan-500 mb-2" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Signal Mapping
            </h4>
            <p className="text-[10px] text-slate-600 leading-relaxed mt-1">
              Automatic ingestion of 13 primary logic signals for deployment safety.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
