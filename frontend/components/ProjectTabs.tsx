'use client';

import { useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';

interface ProjectTabsProps {
  projectId?: number;
  orgId?: number | string;
  canManage?: boolean;
  basePath?: string; // Optional basePath override
  worstAlertCounts?: {
    liveView?: number;
    testLab?: number;
  };
}

export default function ProjectTabs({
  projectId,
  orgId,
  canManage = false,
  basePath: basePathProp,
  worstAlertCounts,
}: ProjectTabsProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine base path - use provided basePath, or use org path if orgId is provided, otherwise fallback to dashboard
  const basePath = basePathProp || (orgId && projectId
    ? `/organizations/${orgId}/projects/${projectId}`
    : projectId
    ? `/dashboard/${projectId}`
    : '');

  const tabs = [
    { id: 'overview', label: 'Overview', path: basePath },
    { id: 'live-view', label: 'Live View', path: `${basePath}/live-view` },
    { id: 'test-lab', label: 'Test Lab', path: `${basePath}/test-lab` },
    { id: 'api-calls', label: 'API Calls', path: `${basePath}/api-calls` },
    { id: 'signals', label: 'Signals', path: `${basePath}/signals` },
    { id: 'worst-prompts', label: 'Worst Prompts', path: `${basePath}/worst-prompts` },
    { id: 'reviews', label: 'Reviews', path: `${basePath}/reviews` },
    { id: 'quality', label: 'Quality', path: `${basePath}/quality` },
    { id: 'firewall', label: 'Firewall', path: `${basePath}/firewall` },
    { id: 'replay', label: 'Time Machine', path: `${basePath}/replay` },
    { id: 'alerts', label: 'Alerts', path: `${basePath}/alerts` },
    ...(canManage ? [{ id: 'settings', label: 'Settings', path: `${basePath}/settings` }] : []),
  ];

  const getActiveTab = () => {
    if (pathname?.includes('/live-view')) return 'live-view';
    if (pathname?.includes('/test-lab')) return 'test-lab';
    if (pathname?.includes('/api-calls')) return 'api-calls';
    if (pathname?.includes('/signals')) return 'signals';
    if (pathname?.includes('/worst-prompts')) return 'worst-prompts';
    if (pathname?.includes('/reviews')) return 'reviews';
    if (pathname?.includes('/quality')) return 'quality';
    if (pathname?.includes('/firewall')) return 'firewall';
    if (pathname?.includes('/replay')) return 'replay';
    if (pathname?.includes('/alerts')) return 'alerts';
    if (pathname?.includes('/settings')) return 'settings';
    if (pathname?.includes('/drift')) return 'overview'; // Drift is part of overview
    if (pathname?.includes('/cost')) return 'overview'; // Cost is part of overview
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
                ? 'border-ag-accent text-ag-text'
                : 'border-transparent text-ag-muted hover:text-ag-text hover:border-white/20'
            )}
            >
            <span className="inline-flex items-center gap-1">
              <span>{tab.label}</span>
              {tab.id === 'live-view' && (worstAlertCounts?.liveView || 0) > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500/20 text-[10px] font-semibold text-red-300">
                  {worstAlertCounts.liveView! > 9 ? '9+' : worstAlertCounts.liveView}
                </span>
              )}
              {tab.id === 'test-lab' && (worstAlertCounts?.testLab || 0) > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500/20 text-[10px] font-semibold text-red-300">
                  {worstAlertCounts.testLab! > 9 ? '9+' : worstAlertCounts.testLab}
                </span>
              )}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
