'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
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

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadData();
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
      console.error('Failed to load data:', error);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        projects={projects}
        userEmail={userEmail}
        userName={userName}
        userPlan={userPlan}
        onLogout={handleLogout}
      />
      <main className="flex-1 ml-64">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

