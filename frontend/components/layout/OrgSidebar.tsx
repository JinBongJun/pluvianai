'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Folder, Users, BarChart3, CreditCard, Settings, Plug } from 'lucide-react';
import { clsx } from 'clsx';

interface OrgSidebarProps {
  orgId: number | string;
}

export default function OrgSidebar({ orgId }: OrgSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const orgIdStr = String(orgId);

  const isActive = (path: string) => {
    if (path === `/organizations/${orgIdStr}/projects`) {
      // Projects is active only when on projects list, not when inside a project
      return pathname === path || pathname === `/organizations/${orgIdStr}/projects/new`;
    }
    return pathname?.startsWith(path);
  };

  const navItems = [
    {
      label: 'Projects',
      icon: Folder,
      href: `/organizations/${orgIdStr}/projects`,
      active: isActive(`/organizations/${orgIdStr}/projects`),
    },
    {
      label: 'Team',
      icon: Users,
      href: `/organizations/${orgIdStr}/team`,
      active: isActive(`/organizations/${orgIdStr}/team`),
    },
    {
      label: 'Integrations',
      icon: Plug,
      href: `/organizations/${orgIdStr}/integrations`,
      active: isActive(`/organizations/${orgIdStr}/integrations`),
    },
    {
      label: 'Usage',
      icon: BarChart3,
      href: `/organizations/${orgIdStr}/usage`,
      active: isActive(`/organizations/${orgIdStr}/usage`),
    },
    {
      label: 'Billing',
      icon: CreditCard,
      href: `/organizations/${orgIdStr}/billing`,
      active: isActive(`/organizations/${orgIdStr}/billing`),
    },
    {
      label: 'Organization settings',
      icon: Settings,
      href: `/organizations/${orgIdStr}/settings`,
      active: isActive(`/organizations/${orgIdStr}/settings`),
    },
  ];

  return (
    <div className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-64 bg-ag-surface border-r border-white/10 flex flex-col overflow-y-auto">
      <nav className="flex-1 px-2 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  item.active
                    ? 'bg-ag-primary/20 text-ag-text border-l-2 border-ag-accent'
                    : 'text-ag-muted hover:bg-white/5 hover:text-ag-text'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
