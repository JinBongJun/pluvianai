'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import GlobalSearch from '@/components/search/GlobalSearch';
import { useGlobalShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Project } from '@/lib/api';
import { projectsAPI } from '@/lib/api';

import TopHeader from './TopHeader';

interface DashboardLayoutProps {
  children: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}

export default function DashboardLayout({ children, breadcrumb }: DashboardLayoutProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userPlan, setUserPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);

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
      <div className="flex items-center justify-center min-h-screen bg-ag-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-ag-accent/20 border-t-ag-accent"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-ag-bg text-ag-text">
      <Sidebar
        projects={projects}
        userEmail={userEmail}
        userName={userName}
        userPlan={userPlan}
        onLogout={handleLogout}
      />
      <div className="flex-1 ml-64 flex flex-col">
        <TopHeader 
          breadcrumb={breadcrumb}
          onSearchClick={() => setShowSearch(true)}
          userEmail={userEmail}
          userName={userName}
          userPlan={userPlan}
          onLogout={handleLogout}
          rightContent={
            <div className="flex items-center gap-2">
              <NotificationCenter />
            </div>
          }
        />
        <main className="flex-1 overflow-auto">
          <div className="p-8 max-w-7xl mx-auto">
            <GlobalSearch isOpen={showSearch} onClose={() => setShowSearch(false)} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

