'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { organizationsAPI } from '@/lib/api';
import { getLastSelectedOrgId } from '@/components/layout/OrgSelector';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    const redirectToOrg = async () => {
      try {
        // Check for create parameter - redirect to org selection or first org
        if (searchParams?.get('create') === 'true') {
          const lastOrgId = getLastSelectedOrgId();
          if (lastOrgId) {
            router.push(`/organizations/${lastOrgId}/projects/new`);
            return;
          }
        }

        // Check localStorage for last selected org
        const lastOrgId = getLastSelectedOrgId();
        if (lastOrgId) {
          router.push(`/organizations/${lastOrgId}/projects`);
          return;
        }

        // Get user's organizations
        const orgs = await organizationsAPI.list({ includeStats: false });
        
        if (orgs.length === 0) {
          // No orgs, redirect to create org page
          router.push('/organizations/new');
          return;
        }

        // Redirect to first org
        const firstOrg = orgs[0];
        localStorage.setItem('lastSelectedOrgId', String(firstOrg.id));
        router.push(`/organizations/${firstOrg.id}/projects`);
      } catch (error) {
        // Log error to Sentry in production
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to redirect:', error);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(error as Error);
          });
        }
        // Fallback to organizations list
        router.push('/organizations');
      }
    };

    redirectToOrg();
  }, [router, searchParams]);

  // Show loading state while redirecting
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#000314]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500/20 border-t-purple-500 mx-auto mb-4"></div>
        <p className="text-slate-400">Redirecting...</p>
      </div>
    </div>
  );
}
