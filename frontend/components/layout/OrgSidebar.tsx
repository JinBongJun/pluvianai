'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Folder, BarChart3, CreditCard, Settings } from 'lucide-react';
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
      return pathname === path || pathname?.startsWith(`${path}/`);
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
      label: 'Analytics',
      icon: BarChart3,
      href: `/organizations/${orgIdStr}/analytics`,
      active: isActive(`/organizations/${orgIdStr}/analytics`),
      disabled: true,
    },
    {
      label: 'Billing',
      icon: CreditCard,
      href: `/organizations/${orgIdStr}/billing`,
      active: isActive(`/organizations/${orgIdStr}/billing`),
      disabled: true,
    },
    {
      label: 'Settings',
      icon: Settings,
      href: `/organizations/${orgIdStr}/settings`,
      active: isActive(`/organizations/${orgIdStr}/settings`),
      disabled: true,
    },
  ];

  return (
    <div className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-64 bg-[#0B0C15] border-r border-white/10 flex flex-col overflow-y-auto">
      <nav className="flex-1 px-2 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => !item.disabled && router.push(item.href)}
                disabled={item.disabled}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  item.active && !item.disabled
                    ? 'bg-purple-500/20 text-white border-l-2 border-purple-500'
                    : item.disabled
                    ? 'text-slate-500 cursor-not-allowed'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
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
