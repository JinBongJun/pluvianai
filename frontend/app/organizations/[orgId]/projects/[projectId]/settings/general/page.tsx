"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import useSWR from "swr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ProjectSettingsShell from "@/components/layout/ProjectSettingsShell";
import { liveViewAPI, projectsAPI } from "@/lib/api";
import { useToast } from "@/components/ToastContainer";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { orgKeys } from "@/lib/queryKeys";
import { deleteProject, revalidateOrganizationProjectLists } from "@/lib/orgProjectMutations";
import { getProjectPermissionToast } from "@/lib/projectAccess";
import {
  buildCanonicalProjectPath,
  getProjectScopeMismatchOrgId,
} from "@/lib/projectRouteScope";
import { useRequireAuth } from "@/hooks/useRequireAuth";

function ProjectGeneralSettingsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const hasToken = useRequireAuth();
  const { mutate } = useSWRConfig();
  const { orgId, projectId } = useOrgProjectParams();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState<Set<number>>(new Set());
  const [isRestoringDeleted, setIsRestoringDeleted] = useState(false);
  const [isPermanentlyDeleting, setIsPermanentlyDeleting] = useState(false);

  const loadProject = useCallback(async () => {
    if (!projectId || isNaN(projectId)) return;
    try {
      const p = await projectsAPI.get(projectId, { expectedOrgId: orgId });
      setName(p.name ?? "");
      setDescription(p.description ?? "");
    } catch (e: any) {
      const actualOrgId = getProjectScopeMismatchOrgId(e);
      if (actualOrgId && pathname) {
        router.replace(
          buildCanonicalProjectPath(
            pathname,
            orgId,
            actualOrgId,
            projectId,
            searchParams?.toString() ? `?${searchParams.toString()}` : ""
          )
        );
        return;
      }
      const status = e?.response?.status;
      if (status === 404) {
        showToast("This project no longer exists. Redirecting to projects list.", "info");
        router.replace(orgId ? `/organizations/${orgId}/projects` : "/organizations");
        return;
      }
      showToast("Failed to load project", "error");
    } finally {
      setLoading(false);
    }
  }, [pathname, projectId, orgId, router, searchParams, showToast]);

  useEffect(() => {
    if (!hasToken) return;
    if (projectId && !isNaN(projectId)) {
      void loadProject();
    }
  }, [projectId, hasToken, loadProject]);

  const { data: deletedSnapshotsData, mutate: mutateDeletedSnapshots } = useSWR(
    hasToken && projectId && !Number.isNaN(projectId)
      ? ["deleted-snapshots-settings", projectId]
      : null,
    () => liveViewAPI.listDeletedSnapshots(projectId!, { days: 30, limit: 200, offset: 0 }),
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      errorRetryCount: 0,
    }
  );
  const deletedSnapshots = useMemo(() => deletedSnapshotsData?.items ?? [], [deletedSnapshotsData?.items]);

  useEffect(() => {
    if (!deletedSnapshots.length) {
      setSelectedDeletedIds(new Set());
      return;
    }
    const allowedIds = new Set(deletedSnapshots.map(item => Number(item.id)));
    setSelectedDeletedIds(prev => {
      const next = new Set<number>();
      prev.forEach(id => {
        if (allowedIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [deletedSnapshots]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || isNaN(projectId)) return;
    setSaving(true);
    try {
      await projectsAPI.update(projectId, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      });
      if (orgId) await revalidateOrganizationProjectLists(mutate, orgId);
      showToast("Project updated", "success");
    } catch (err: any) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Updating project settings",
        error: err,
      });
      showToast(
        permissionToast?.message ?? err?.response?.data?.detail ?? "Failed to update project",
        permissionToast?.tone ?? "error"
      );
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
      await deleteProject(orgId ?? "", projectId, {
        mutate,
        router,
        toast: { showToast },
      });
      setDeleted(true);
    } catch (err: any) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Deleting this project",
        error: err,
      });
      showToast(
        permissionToast?.message ?? err?.response?.data?.detail ?? "Failed to delete project",
        permissionToast?.tone ?? "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  const toggleDeletedSnapshotSelection = (id: number) => {
    setSelectedDeletedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const restoreSelectedDeletedSnapshots = async () => {
    if (!projectId || Number.isNaN(projectId) || selectedDeletedIds.size === 0) return;
    const targetIds = Array.from(selectedDeletedIds);
    setIsRestoringDeleted(true);
    try {
      const result = await liveViewAPI.restoreSnapshotsBatch(projectId, targetIds);
      const restored = Number(result?.restored ?? 0);
      showToast(
        restored > 0 ? `Restored ${restored} deleted log(s).` : "No deleted logs were restored.",
        restored > 0 ? "success" : "info"
      );
      setSelectedDeletedIds(new Set());
      await mutateDeletedSnapshots();
    } catch (error: any) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Restoring deleted logs",
        error,
      });
      const message =
        permissionToast?.message ||
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to restore deleted logs.";
      showToast(message, permissionToast?.tone ?? "error");
    } finally {
      setIsRestoringDeleted(false);
    }
  };

  const permanentlyDeleteSelectedSnapshots = async () => {
    if (!projectId || Number.isNaN(projectId) || selectedDeletedIds.size === 0) return;
    const confirmed = window.confirm(
      "Permanently delete selected logs now? This action cannot be undone."
    );
    if (!confirmed) return;
    const targetIds = Array.from(selectedDeletedIds);
    setIsPermanentlyDeleting(true);
    try {
      const result = await liveViewAPI.permanentlyDeleteSnapshots(projectId, targetIds);
      const deleted = Number(result?.deleted ?? 0);
      showToast(
        deleted > 0
          ? `Permanently deleted ${deleted} log(s).`
          : "No deleted logs were permanently removed.",
        deleted > 0 ? "success" : "info"
      );
      setSelectedDeletedIds(new Set());
      await mutateDeletedSnapshots();
    } catch (error: any) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Permanently deleting logs",
        error,
      });
      const message =
        permissionToast?.message ||
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to permanently delete logs.";
      showToast(message, permissionToast?.tone ?? "error");
    } finally {
      setIsPermanentlyDeleting(false);
    }
  };

  if (!projectId || isNaN(projectId) || deleted) {
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

          <Card>
            <CardHeader>
              <CardTitle>Recently Deleted Logs (Last 30 Days)</CardTitle>
              <CardDescription>
                Restore logs deleted from Live View or permanently remove them before the 30-day
                cleanup window.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {deletedSnapshots.length === 0 ? (
                <p className="text-sm text-slate-400">No deleted logs found in the last 30 days.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={restoreSelectedDeletedSnapshots}
                      disabled={selectedDeletedIds.size === 0 || isRestoringDeleted}
                    >
                      {isRestoringDeleted
                        ? "Restoring..."
                        : `Restore selected (${selectedDeletedIds.size})`}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={permanentlyDeleteSelectedSnapshots}
                      disabled={selectedDeletedIds.size === 0 || isPermanentlyDeleting}
                    >
                      {isPermanentlyDeleting
                        ? "Deleting..."
                        : `Delete permanently (${selectedDeletedIds.size})`}
                    </Button>
                  </div>
                  <div className="overflow-x-auto border border-white/10 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/5 text-slate-300">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Select</th>
                          <th className="px-3 py-2 text-left font-semibold">Time</th>
                          <th className="px-3 py-2 text-left font-semibold">Agent</th>
                          <th className="px-3 py-2 text-left font-semibold">Trace ID</th>
                          <th className="px-3 py-2 text-left font-semibold">Deleted At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletedSnapshots.map(item => (
                          <tr key={item.id} className="border-t border-white/10">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedDeletedIds.has(Number(item.id))}
                                onChange={() => toggleDeletedSnapshotSelection(Number(item.id))}
                              />
                            </td>
                            <td className="px-3 py-2 text-slate-200">
                              {item.created_at
                                ? new Date(item.created_at).toLocaleString()
                                : "-"}
                            </td>
                            <td className="px-3 py-2 text-slate-200">{item.agent_id || "-"}</td>
                            <td className="px-3 py-2 text-slate-300 font-mono">
                              {item.trace_id || "-"}
                            </td>
                            <td className="px-3 py-2 text-slate-400">
                              {item.deleted_at
                                ? new Date(item.deleted_at).toLocaleString()
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </ProjectSettingsShell>
  );
}

export default function ProjectGeneralSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectGeneralSettingsPageContent />
    </Suspense>
  );
}
