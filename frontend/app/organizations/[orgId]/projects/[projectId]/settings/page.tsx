"use client";

import Link from "next/link";
import ProjectSettingsShell from "@/components/layout/ProjectSettingsShell";
import { Bell, Key, FileText } from "lucide-react";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function ProjectSettingsPage() {
  const { orgId, projectId } = useOrgProjectParams();

  useRequireAuth();

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  const sections = [
    {
      id: "general",
      title: "General",
      description: "Project name and description",
      href: `${basePath}/settings/general`,
      icon: FileText,
    },
    {
      id: "notifications",
      title: "Notifications",
      description: "Configure how you receive alerts for this project",
      href: `${basePath}/settings/notifications`,
      icon: Bell,
    },
    {
      id: "api-keys",
      title: "API Keys",
      description: "LLM API keys (OpenAI, Anthropic, Google). Custom models coming next.",
      href: `${basePath}/settings/api-keys`,
      icon: Key,
    },
  ];

  return (
    <ProjectSettingsShell
      orgId={orgId}
      projectId={projectId}
      title="Project Settings"
      description="Manage project name, notifications, and LLM API keys"
    >
      <div className="grid gap-4">
        {sections.map(section => {
          const Icon = section.icon;
          const content = (
            <div className="flex items-start gap-4 p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-colors">
              <div className="flex-shrink-0 p-2 rounded-lg bg-ag-accent/20">
                <Icon className="h-5 w-5 text-ag-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                <p className="text-sm text-slate-400 mt-1">{section.description}</p>
              </div>
            </div>
          );

          return (
            <Link key={section.id} href={section.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </ProjectSettingsShell>
  );
}
