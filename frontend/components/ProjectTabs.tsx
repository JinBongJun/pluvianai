'use client';

import { useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';

interface ProjectTabsProps {
  projectId: number;
  orgId?: number | string;
  canManage?: boolean;
}

export default function ProjectTabs({ projectId, orgId, canManage = false }: ProjectTabsProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine base path - use org path if orgId is provided, otherwise fallback to dashboard
  const basePath = orgId 
    ? `/organizations/${orgId}/projects/${projectId}`
    : `/dashboard/${projectId}`;

  const tabs = [
    { id: 'overview', label: 'Overview', path: basePath },
    { id: 'api-calls', label: 'API Calls', path: `${basePath}/api-calls` },
    { id: 'chains', label: 'Chains', path: `${basePath}/chains` },
    { id: 'compare', label: 'Compare', path: `${basePath}/compare` },
    { id: 'reports', label: 'Reports', path: `${basePath}/reports` },
    { id: 'alerts', label: 'Alerts', path: `${basePath}/alerts` },
    { id: 'members', label: 'Team Members', path: `${basePath}?tab=members` },
    ...(canManage ? [{ id: 'settings', label: 'Settings', path: `${basePath}?tab=settings` }] : []),
  ];

  const getActiveTab = () => {
    if (pathname?.includes('/api-calls')) return 'api-calls';
    if (pathname?.includes('/chains')) return 'chains';
    if (pathname?.includes('/compare')) return 'compare';
    if (pathname?.includes('/reports')) return 'reports';
    if (pathname?.includes('/alerts')) return 'alerts';
    if (pathname?.includes('/quality')) return 'overview'; // Quality is part of overview
    if (pathname?.includes('/drift')) return 'overview'; // Drift is part of overview
    if (pathname?.includes('/cost')) return 'overview'; // Cost is part of overview
    // Check URL params for members/settings tabs
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'members') return 'members';
      if (params.get('tab') === 'settings') return 'settings';
    }
    return 'overview';
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tab: typeof tabs[0]) => {
    router.push(tab.path);
  };

  return (
    <div className="border-b border-white/10 mb-6">
      <nav className="-mb-px flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            className={clsx(
              'py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200',
              activeTab === tab.id
                ? 'border-purple-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-white/20'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
