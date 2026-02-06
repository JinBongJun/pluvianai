'use client';

import { useRouter, usePathname } from 'next/navigation';
import useSWR from 'swr';
import { clsx } from 'clsx';
import { projectsAPI } from '@/lib/api';

interface ProjectTabsProps {
  projectId?: number;
  orgId?: number | string;
  canManage?: boolean;
  basePath?: string; // Optional basePath override
  usageMode?: 'full' | 'test_only'; // If not provided and projectId is set, fetched from API
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
  usageMode: usageModeProp,
  worstAlertCounts,
}: ProjectTabsProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { data: project } = useSWR(
    projectId && usageModeProp === undefined ? ['project', projectId] : null,
    () => projectsAPI.get(projectId!),
  );
  const usageMode = usageModeProp ?? (project?.usage_mode as 'full' | 'test_only' | undefined) ?? 'full';

  // Determine base path - use provided basePath, or use org path if orgId is provided, otherwise fallback to dashboard
  const basePath = basePathProp || (orgId && projectId
    ? `/organizations/${orgId}/projects/${projectId}`
    : projectId
    ? `/dashboard/${projectId}`
    : '');

  // Design 5.2: live-view (hidden when test_only), test-lab, api-calls, signals, worst-prompts, reviews, alerts, settings
  const allTabs = [
    { id: 'overview', label: 'Overview', path: basePath },
    { id: 'live-view', label: 'Live View', path: `${basePath}/live-view` },
    { id: 'test-lab', label: 'Test Lab', path: `${basePath}/test-lab` },
    { id: 'api-calls', label: 'API Calls', path: `${basePath}/api-calls` },
    { id: 'signals', label: 'Signals', path: `${basePath}/signals` },
    { id: 'worst-prompts', label: 'Worst Prompts', path: `${basePath}/worst-prompts` },
    { id: 'reviews', label: 'Reviews', path: `${basePath}/reviews` },
    { id: 'alerts', label: 'Alerts', path: `${basePath}/alerts` },
    ...(canManage ? [{ id: 'settings', label: 'Settings', path: `${basePath}/settings` }] : []),
  ];
  const tabs = usageMode === 'test_only'
    ? allTabs.filter((t) => t.id !== 'live-view')
    : allTabs;

  const getActiveTab = () => {
    if (pathname?.includes('/live-view')) return 'live-view';
    if (pathname?.includes('/test-lab')) return 'test-lab';
    if (pathname?.includes('/api-calls')) return 'api-calls';
    if (pathname?.includes('/signals')) return 'signals';
    if (pathname?.includes('/worst-prompts')) return 'worst-prompts';
    if (pathname?.includes('/reviews')) return 'reviews';
    if (pathname?.includes('/alerts')) return 'alerts';
    if (pathname?.includes('/settings')) return 'settings';
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
                  {(worstAlertCounts?.liveView ?? 0) > 9 ? '9+' : worstAlertCounts?.liveView ?? 0}
                </span>
              )}
              {tab.id === 'test-lab' && (worstAlertCounts?.testLab || 0) > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500/20 text-[10px] font-semibold text-red-300">
                  {(worstAlertCounts?.testLab ?? 0) > 9 ? '9+' : worstAlertCounts?.testLab ?? 0}
                </span>
              )}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
