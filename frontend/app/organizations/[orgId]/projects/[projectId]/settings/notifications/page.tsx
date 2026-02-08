'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import NotificationSettings from '@/components/notifications/NotificationSettings';
import OrgLayout from '@/components/layout/OrgLayout';
import ProjectTabs from '@/components/ProjectTabs';

export default function NotificationSettingsPage() {
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

  return (
    <OrgLayout orgId={orgId}>
      <div className="min-h-screen bg-ag-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProjectTabs projectId={projectId} orgId={orgId} basePath={basePath} />

          <div className="mt-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">Notification Settings</h1>
              <p className="text-slate-400">Configure how you receive alerts for this project</p>
            </div>

            <NotificationSettings projectId={projectId} />
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
