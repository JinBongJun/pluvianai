"use client";

import NotificationSettings from "@/components/notifications/NotificationSettings";
import ProjectSettingsShell from "@/components/layout/ProjectSettingsShell";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function NotificationSettingsPage() {
  const { orgId, projectId } = useOrgProjectParams();

  useRequireAuth();

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  return (
    <ProjectSettingsShell
      orgId={orgId}
      projectId={projectId}
      title="Notification Settings"
      description="Configure how you receive alerts for this project"
    >
      <NotificationSettings projectId={projectId} />
    </ProjectSettingsShell>
  );
}
