"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProjectSettingsShell from "@/components/layout/ProjectSettingsShell";
import { projectsAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { Button } from "@/components/ui/Button";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function ProjectGeneralSettingsPage() {
  const params = useParams();
  const toast = useToast();
  const hasToken = useRequireAuth();

  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(
    Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [usageMode, setUsageMode] = useState<"full" | "test_only">("full");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const loadProject = useCallback(async () => {
    if (!projectId || isNaN(projectId)) return;
    try {
      const p = await projectsAPI.get(projectId);
      setName(p.name ?? "");
      setDescription(p.description ?? "");
      setUsageMode((p.usage_mode as "full" | "test_only") ?? "full");
    } catch (e) {
      toast.showToast("Failed to load project", "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (!hasToken) return;
    if (projectId && !isNaN(projectId)) {
      void loadProject();
    }
  }, [projectId, hasToken, loadProject]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || isNaN(projectId)) return;
    setSaving(true);
    try {
      await projectsAPI.update(projectId, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.showToast("Project updated", "success");
    } catch (err: any) {
      toast.showToast(err?.response?.data?.detail ?? "Failed to update project", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpgradeToFullMode = async () => {
    if (!projectId || isNaN(projectId)) return;
    setUpgrading(true);
    try {
      await projectsAPI.update(projectId, { usage_mode: "full" });
      setUsageMode("full");
      toast.showToast("Upgraded to Full Mode. Live View is now available.", "success");
    } catch (err: any) {
      toast.showToast(err?.response?.data?.detail ?? "Failed to upgrade", "error");
    } finally {
      setUpgrading(false);
    }
  };

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  return (
    <ProjectSettingsShell
      orgId={orgId}
      projectId={projectId}
      title="General"
      description="Project name and description"
    >
      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Project name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-ag-accent focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-ag-accent focus:outline-none resize-none"
            />
          </div>

          <div className="border-t border-white/10 pt-6 mt-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">Usage Mode</label>
            <p className="text-slate-400 text-sm mb-2">
              {usageMode === "full"
                ? "Full Mode — Live View and Policy are available. You can monitor real traffic and validate policy."
                : "Test Only — Policy validation is available without Live SDK ingestion. Upgrade to Full Mode to enable Live View."}
            </p>
            {usageMode === "test_only" && (
              <Button
                type="button"
                variant="primary"
                onClick={handleUpgradeToFullMode}
                disabled={upgrading}
              >
                {upgrading ? "Upgrading..." : "Upgrade to Full Mode"}
              </Button>
            )}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </form>
      )}
    </ProjectSettingsShell>
  );
}
