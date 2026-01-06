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
    <div className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo/Header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-black rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">AG</span>
          </div>
          <span className="font-semibold text-gray-900">AgentGuard</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <div className="space-y-1">
          {/* Dashboard */}
          <button
            onClick={() => router.push('/dashboard')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive('/dashboard')
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Dashboard</span>
          </button>

          {/* Projects Section */}
          <div>
            <button
              onClick={() => setIsProjectsOpen(!isProjectsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
                        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors text-left',
                        isProjectActive(project.id)
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <div className="h-2 w-2 rounded-full bg-gray-400" />
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))
                )}
                <button
                  onClick={() => router.push('/dashboard?create=true')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-50 transition-colors"
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
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={userName} email={userEmail} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {userName || userEmail || 'User'}
            </div>
            <div className="text-xs text-gray-500 truncate">{userEmail}</div>
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
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

