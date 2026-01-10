'use client';

import { useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';

interface ProjectTabsProps {
  projectId: number;
  canManage?: boolean;
}

export default function ProjectTabs({ projectId, canManage = false }: ProjectTabsProps) {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    { id: 'overview', label: 'Overview', path: `/dashboard/${projectId}` },
    { id: 'api-calls', label: 'API Calls', path: `/dashboard/${projectId}/api-calls` },
    { id: 'chains', label: 'Chains', path: `/dashboard/${projectId}/chains` },
    { id: 'compare', label: 'Compare', path: `/dashboard/${projectId}/compare` },
    { id: 'reports', label: 'Reports', path: `/dashboard/${projectId}/reports` },
    { id: 'members', label: 'Team Members', path: `/dashboard/${projectId}?tab=members` },
    ...(canManage ? [{ id: 'settings', label: 'Settings', path: `/dashboard/${projectId}?tab=settings` }] : []),
  ];

  const getActiveTab = () => {
    if (pathname?.includes('/api-calls')) return 'api-calls';
    if (pathname?.includes('/chains')) return 'chains';
    if (pathname?.includes('/compare')) return 'compare';
    if (pathname?.includes('/reports')) return 'reports';
    if (pathname?.includes('/quality')) return 'overview'; // Quality is part of overview
    if (pathname?.includes('/drift')) return 'overview'; // Drift is part of overview
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
