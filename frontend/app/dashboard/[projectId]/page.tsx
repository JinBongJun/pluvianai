'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { projectsAPI } from '@/lib/api';

export default function ProjectRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = Number(params.projectId);

  useEffect(() => {
    const redirect = async () => {
      try {
        const project = await projectsAPI.get(projectId);
        
        if (project.organization_id) {
          router.push(`/organizations/${project.organization_id}/projects/${projectId}`);
        } else {
          // Project has no org, redirect to organizations list
          router.push('/organizations');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to redirect project:', error);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(error as Error);
          });
        }
        router.push('/organizations');
      }
    };

    if (projectId && !isNaN(projectId) && projectId > 0) {
      redirect();
    } else {
      router.push('/organizations');
    }
  }, [projectId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#000314]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500/20 border-t-purple-500 mx-auto mb-4"></div>
        <p className="text-slate-400">Redirecting...</p>
      </div>
    </div>
  );
}
