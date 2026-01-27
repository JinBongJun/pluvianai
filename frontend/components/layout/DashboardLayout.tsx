'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import GlobalSearch from '@/components/search/GlobalSearch';
import { useGlobalShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Project } from '@/lib/api';
import { projectsAPI } from '@/lib/api';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userPlan, setUserPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);

  useGlobalShortcuts();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadData();
    
    // Listen for project update events to refresh the projects list
    const handleProjectUpdate = () => {
      loadData();
    };
    
    window.addEventListener('projectUpdated', handleProjectUpdate);
    
    return () => {
      window.removeEventListener('projectUpdated', handleProjectUpdate);
    };
  }, [router]);

  const loadData = async () => {
    try {
      const { authAPI, subscriptionAPI } = await import('@/lib/api');
      const [projectsData, userData, subscriptionData] = await Promise.all([
        projectsAPI.list(),
        authAPI.getCurrentUser().catch(() => null),
        subscriptionAPI.getCurrent().catch(() => null),
      ]);
      
      setProjects(projectsData);
      
      // Set user info
      if (userData) {
        setUserEmail(userData.email || '');
        setUserName(userData.full_name || '');
      }
      
      // Set subscription info
      if (subscriptionData) {
        setUserPlan(subscriptionData.plan_type || 'free');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load data:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#000314]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500/20 border-t-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#000314]">
      <Sidebar
        projects={projects}
        userEmail={userEmail}
        userName={userName}
        userPlan={userPlan}
        onLogout={handleLogout}
      />
      <main className="flex-1 ml-64">
        <div className="p-8">
          {/* Notification Center - Fixed position */}
          <div className="fixed top-4 right-4 z-50">
            <NotificationCenter />
          </div>
          {/* Global Search */}
          <GlobalSearch />
          {children}
        </div>
      </main>
    </div>
  );
}

