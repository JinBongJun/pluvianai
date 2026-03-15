"use client";

import { useCallback, useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import ProjectSettingsShell from "@/components/layout/ProjectSettingsShell";
import { projectsAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function ProjectGeneralSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const hasToken = useRequireAuth();
  const { mutate } = useSWRConfig();
  const { orgId, projectId } = useOrgProjectParams();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadProject = useCallback(async () => {
    if (!projectId || isNaN(projectId)) return;
    try {
      const p = await projectsAPI.get(projectId);
      setName(p.name ?? "");
      setDescription(p.description ?? "");
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

  const handleDeleteProject = async () => {
    if (!projectId || isNaN(projectId)) return;
    const confirmed = window.confirm(
      "Delete this project permanently? This action cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await projectsAPI.delete(projectId);
      toast.showToast("Project deleted", "success");
      // Prevent SWR from revalidating deleted project (avoids 404 in Network tab)
      mutate(["project", projectId], undefined, { revalidate: false });
      mutate(
        (k) => Array.isArray(k) && k[0] === "organization-projects-list" && k[1] === orgId,
        undefined,
        { revalidate: false }
      );
      router.push(`/organizations/${orgId}/projects`);
    } catch (err: any) {
      toast.showToast(err?.response?.data?.detail ?? "Failed to delete project", "error");
    } finally {
      setDeleting(false);
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
        <div className="space-y-6 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>Update project name and description.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-12 text-base"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="project-description">Description (optional)</Label>
                  <textarea
                    id="project-description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-base text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none resize-none"
                    placeholder="Briefly describe this project."
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-rose-500/30 bg-rose-500/[0.04]">
            <CardHeader>
              <CardTitle className="text-rose-400">Danger Zone</CardTitle>
              <CardDescription>
                This permanently deletes the project and related records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="danger"
                disabled={deleting}
                onClick={handleDeleteProject}
              >
                {deleting ? "Deleting..." : "Delete project"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </ProjectSettingsShell>
  );
}
