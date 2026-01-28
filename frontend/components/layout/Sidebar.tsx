'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  Folder, 
  Users, 
  Settings, 
  ChevronRight,
  ChevronDown,
  LogOut,
  User
} from 'lucide-react';
import { clsx } from 'clsx';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { Project } from '@/lib/api';

interface SidebarProps {
  projects?: Project[];
  userEmail?: string;
  userName?: string;
  userPlan?: string;
  onLogout: () => void;
}

export default function Sidebar({
  projects = [],
  userEmail,
  userName,
  userPlan = 'free',
  onLogout,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isProjectsOpen, setIsProjectsOpen] = useState(true);

  const isActive = (path: string) => pathname === path;
  const isProjectActive = (projectId: number) => pathname === `/dashboard/${projectId}`;

  const planColors: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
    free: 'default',
    indie: 'info',
    startup: 'success',
    pro: 'warning',
    enterprise: 'info',
  };

  return (
    <div className="fixed left-0 top-0 h-screen w-64 bg-ag-surface border-r border-white/10 flex flex-col shadow-xl">
      {/* Logo/Header */}
      <div className="px-4 py-4 border-b border-white/10">
        <Link href="/organizations" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="h-8 w-8 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-lg flex items-center justify-center shadow-lg shadow-ag-primary/40">
            <span className="text-ag-accent-light font-bold text-sm">AG</span>
          </div>
          <span className="font-semibold text-ag-text">AgentGuard</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <div className="space-y-1">
          {/* Dashboard - Redirects to organizations */}
          <button
            onClick={() => router.push('/organizations')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              pathname?.startsWith('/organizations') && !pathname?.startsWith('/organizations/')
                ? 'bg-ag-primary/20 text-ag-text border-l-2 border-ag-accent'
                : 'text-ag-muted hover:bg-white/5 hover:text-ag-text'
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Dashboard</span>
          </button>

          {/* Organizations */}
          <button
            onClick={() => router.push('/organizations')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              pathname?.startsWith('/organizations')
                ? 'bg-ag-primary/20 text-ag-text border-l-2 border-ag-accent'
                : 'text-ag-muted hover:bg-white/5 hover:text-ag-text',
            )}
          >
            <Users className="h-5 w-5" />
            <span>Organizations</span>
          </button>

          {/* Projects Section */}
          <div>
            <button
              onClick={() => setIsProjectsOpen(!isProjectsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-ag-muted hover:bg-white/5 hover:text-ag-text transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <Folder className="h-5 w-5" />
                <span>Projects</span>
              </div>
              {isProjectsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {isProjectsOpen && (
              <div className="ml-8 mt-1 space-y-1">
                {projects.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-ag-muted">
                    No projects yet
                  </div>
                ) : (
                  projects.map((project) => {
                    const handleProjectClick = async () => {
                      try {
                        const proj = await import('@/lib/api').then(m => m.projectsAPI.get(project.id));
                        if (proj.organization_id) {
                          router.push(`/organizations/${proj.organization_id}/projects/${project.id}`);
                        } else {
                          router.push(`/dashboard/${project.id}`);
                        }
                      } catch {
                        router.push(`/dashboard/${project.id}`);
                      }
                    };
                    return (
                      <button
                        key={project.id}
                        onClick={handleProjectClick}
                        className={clsx(
                          'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 text-left',
                          isProjectActive(project.id)
                            ? 'bg-ag-primary/20 text-ag-text font-medium border-l-2 border-ag-accent'
                            : 'text-ag-muted hover:bg-white/5 hover:text-ag-text'
                        )}
                      >
                        <div className={clsx(
                          'h-2 w-2 rounded-full transition-colors',
                          isProjectActive(project.id) ? 'bg-ag-accent' : 'bg-ag-muted'
                        )} />
                        <span className="truncate">{project.name}</span>
                      </button>
                    );
                  })
                )}
                <button
                  onClick={async () => {
                    const { getLastSelectedOrgId } = await import('@/components/layout/OrgSelector');
                    const lastOrgId = getLastSelectedOrgId();
                    if (lastOrgId) {
                      router.push(`/organizations/${lastOrgId}/projects/new`);
                    } else {
                      router.push('/organizations');
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-ag-muted hover:bg-white/5 hover:text-ag-accent transition-all duration-200"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>New Project</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={userName} email={userEmail} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ag-text truncate">
              {userName || userEmail || 'User'}
            </div>
            <div className="text-xs text-ag-muted truncate">{userEmail}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Badge variant={planColors[userPlan] || 'default'} size="sm">
            {userPlan.charAt(0).toUpperCase() + userPlan.slice(1)}
          </Badge>
        </div>
        <div className="space-y-1">
          <button
            onClick={() => router.push('/settings')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
              pathname?.startsWith('/settings')
                ? 'bg-ag-primary/20 text-ag-text border-l-2 border-ag-accent'
                : 'text-ag-muted hover:bg-white/5 hover:text-ag-text'
            )}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ag-muted hover:bg-white/5 hover:text-ag-text transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}


