'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
    <div className="fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-slate-900 to-slate-800 border-r border-slate-700 flex flex-col shadow-xl">
      {/* Logo/Header */}
      <div className="px-4 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/50">
            <span className="text-white font-bold text-sm">AG</span>
          </div>
          <span className="font-semibold text-white">AgentGuard</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <div className="space-y-1">
          {/* Dashboard */}
          <button
            onClick={() => router.push('/dashboard')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              isActive('/dashboard')
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/50'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Dashboard</span>
          </button>

          {/* Projects Section */}
          <div>
            <button
              onClick={() => setIsProjectsOpen(!isProjectsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200"
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
                  <div className="px-3 py-2 text-xs text-gray-500">
                    No projects yet
                  </div>
                ) : (
                  projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => router.push(`/dashboard/${project.id}`)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 text-left',
                        isProjectActive(project.id)
                          ? 'bg-primary-600/20 text-white font-medium border-l-2 border-primary-500'
                          : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                      )}
                    >
                      <div className={clsx(
                        'h-2 w-2 rounded-full transition-colors',
                        isProjectActive(project.id) ? 'bg-primary-400' : 'bg-slate-500'
                      )} />
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))
                )}
                <button
                  onClick={() => router.push('/dashboard?create=true')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:bg-slate-700/50 hover:text-primary-400 transition-all duration-200"
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
      <div className="border-t border-slate-700 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={userName} email={userEmail} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {userName || userEmail || 'User'}
            </div>
            <div className="text-xs text-slate-400 truncate">{userEmail}</div>
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
                ? 'bg-primary-600/20 text-white border-l-2 border-primary-500'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            )}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}


