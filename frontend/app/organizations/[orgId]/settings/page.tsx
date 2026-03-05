"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { organizationsAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { Settings, Trash2, AlertTriangle, Save, Fingerprint } from "lucide-react";

export default function OrgSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: org, mutate: refetchOrg } = useSWR(
    orgId ? ["organization", orgId] : null,
    async () => {
      const data = await organizationsAPI.get(orgId, { includeStats: false });
      setOrgName(data.name || "");
      return data;
    }
  );

  const handleSave = async () => {
    if (!orgName.trim()) {
      toast.showToast("Environment designation cannot be empty.", "warning");
      return;
    }

    setSaving(true);
    try {
      await organizationsAPI.update(orgId, { name: orgName });
      toast.showToast("Environment configuration updated successfully.", "success");
      refetchOrg();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || "Failed to update configuration.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== org?.name) {
      toast.showToast("Authorization phrase mismatch. Revocation aborted.", "warning");
      return;
    }

    try {
      await organizationsAPI.delete(orgId);
      toast.showToast("Environment permanently decommissioned.", "success");
      router.push("/organizations");
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || "Failed to decommission environment.",
        "error"
      );
    }
  };

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: "Organizations", href: "/organizations" },
        { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
        { label: "Clinical Settings" },
      ]}
    >
      <div className="max-w-4xl mx-auto pb-24 relative">
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="mb-12 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)] animate-pulse" />
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">
              Laboratory Environment
            </p>
          </div>
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-4">
            Clinical Settings
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm max-w-2xl leading-relaxed">
            Configure core laboratory parameters, manage directory identity, and oversee critical
            infrastructure risks.
          </p>
        </div>

        {/* Core Configuration */}
        <div className="rounded-[32px] border border-white/10 bg-white/[0.02] backdrop-blur-xl p-8 mb-12 relative overflow-hidden group">
          <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-xl font-black text-white uppercase tracking-widest mb-8 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <Settings className="w-4 h-4" />
              </div>
              Core Configuration
            </h2>

            <div className="space-y-8 max-w-2xl">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">
                  Environment Designation (Name)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="Enter organization name"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 h-14 text-white text-lg font-medium placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-all duration-300"
                  />
                  {orgName !== org?.name && orgName.trim() !== "" && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
                  <Fingerprint className="w-3 h-3" />
                  System Identifier (UUID)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={orgId}
                    disabled
                    className="w-full bg-black/20 border border-white/5 rounded-2xl px-6 h-14 text-slate-500 font-mono text-sm cursor-not-allowed"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-slate-800/50 border border-slate-700">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Immunized
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving || orgName === org?.name}
                  className={`h-12 px-8 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all duration-300
                    ${
                      saving
                        ? "bg-emerald-500/50 text-emerald-200 cursor-wait"
                        : orgName === org?.name
                          ? "bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed"
                          : "bg-emerald-500 text-black shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98]"
                    }`}
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Synchronizing..." : "Synchronize State"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-[32px] border border-rose-500/30 bg-rose-500/[0.02] backdrop-blur-xl p-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 -z-10" />

          <h2 className="text-xl font-black text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.15)] animate-pulse">
              <AlertTriangle className="w-4 h-4" />
            </div>
            Critical Override
          </h2>
          <p className="text-sm text-slate-400 mb-8 max-w-xl leading-relaxed">
            Decommissioning this laboratory environment will permanently purge all telemetry,
            projects, policies, and signals.{" "}
            <strong className="text-rose-400">
              This action bypasses all safety protocols and cannot be reversed.
            </strong>
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="h-12 px-6 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest border border-rose-500/30 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/50 transition-all duration-300"
            >
              <Trash2 className="h-4 w-4" />
              Initiate Decommission Protocol
            </button>
          ) : (
            <div className="space-y-6 max-w-xl p-6 rounded-2xl bg-black/40 border border-rose-500/30">
              <p className="text-sm text-rose-300 leading-relaxed">
                To confirm permanent deletion, type the exact environment designation: <br />
                <strong className="text-white text-base py-1 px-2 mt-2 inline-block bg-rose-500/20 border border-rose-500/30 rounded">
                  {org?.name}
                </strong>
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="w-full bg-black/60 border border-rose-500/40 rounded-xl px-5 h-12 text-white placeholder:text-rose-900/50 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 focus:outline-none font-mono text-sm"
                placeholder="Awaiting authorization phrase..."
              />
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                  }}
                  className="h-12 px-6 rounded-xl flex items-center justify-center text-xs font-black uppercase tracking-widest border border-white/10 text-slate-300 bg-white/5 hover:bg-white/10 transition-all duration-300 flex-1 sm:flex-none"
                >
                  Abort Protocol
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== org?.name}
                  className={`h-12 px-6 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all duration-300 flex-1 sm:flex-none
                    ${
                      deleteConfirmText === org?.name
                        ? "bg-rose-500 text-white shadow-[0_0_20px_-5px_rgba(244,63,94,0.6)] hover:bg-rose-600"
                        : "bg-rose-500/20 text-rose-500/50 cursor-not-allowed border border-rose-500/20"
                    }`}
                >
                  <Trash2 className="w-4 h-4" />
                  Execute Deletion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </OrgLayout>
  );
}
