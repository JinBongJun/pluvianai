'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/layout/OrgLayout';
import ProjectTabs from '@/components/ProjectTabs';
import { Settings, Bell, Key, FileText } from 'lucide-react';

export default function ProjectSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  const sections = [
    {
      id: 'general',
      title: 'General',
      description: 'Project name and description',
      href: `${basePath}/settings/general`,
      icon: FileText,
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Configure how you receive alerts for this project',
      href: `${basePath}/settings/notifications`,
      icon: Bell,
    },
    {
      id: 'api-keys',
      title: 'API Keys',
      description: 'LLM API keys (OpenAI, Anthropic, Google). Custom models coming next.',
      href: `${basePath}/settings/api-keys`,
      icon: Key,
    },
  ];

  return (
    <OrgLayout orgId={orgId}>
      <div className="min-h-screen bg-ag-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProjectTabs basePath={basePath} />

          <div className="mt-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <Settings className="h-6 w-6 text-ag-accent" />
                Project Settings
              </h1>
              <p className="text-slate-400">Manage project name, notifications, and LLM API keys</p>
            </div>

            <div className="grid gap-4">
              {sections.map((section) => {
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
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
