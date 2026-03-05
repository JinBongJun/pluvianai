"use client";

import { useParams } from "next/navigation";
import NotificationSettings from "@/components/notifications/NotificationSettings";
import ProjectSettingsShell from "@/components/layout/ProjectSettingsShell";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function NotificationSettingsPage() {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(
    Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId
  );

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
