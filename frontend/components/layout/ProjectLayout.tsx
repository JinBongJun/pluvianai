'use client';

import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopHeader from './TopHeader';
import OrgSelector from './OrgSelector';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import GlobalSearch from '@/components/search/GlobalSearch';

interface ProjectLayoutContextType {
  orgId: number | string;
  projectId: number;
}

const ProjectLayoutContext = createContext<ProjectLayoutContextType | undefined>(undefined);

export function useProjectLayout() {
  const context = useContext(ProjectLayoutContext);
  if (!context) {
    throw new Error('useProjectLayout must be used within ProjectLayout');
  }
  return context;
}

interface ProjectLayoutProps {
  children: ReactNode;
  orgId: number | string;
  projectId: number;
  breadcrumb?: { label: string; href?: string }[];
}

export default function ProjectLayout({ children, orgId, projectId, breadcrumb = [] }: ProjectLayoutProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userPlan, setUserPlan] = useState<string>('free');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { authAPI, subscriptionAPI } = await import('@/lib/api');
        const [user, subscription] = await Promise.all([
          authAPI.getCurrentUser(),
          subscriptionAPI.getCurrent().catch(() => null)
        ]);
        setUserEmail(user.email || '');
        setUserName(user.full_name || '');
        if (subscription) {
          setUserPlan(subscription.plan_type || 'free');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load user info:', error);
        }
      }
    };
    loadUser();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/login');
  };

  const handleOrgChange = (newOrgId: number) => {
    router.push(`/organizations/${newOrgId}/projects`);
  };

  return (
    <ProjectLayoutContext.Provider value={{ orgId, projectId }}>
      <div className="min-h-screen bg-ag-bg text-ag-text">
        <TopHeader 
          breadcrumb={breadcrumb}
          leftContent={<OrgSelector currentOrgId={orgId} onOrgChange={handleOrgChange} />}
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

        {/* No sidebar - full width content */}
        <main className="overflow-auto">
          <div className="p-8 max-w-7xl mx-auto">
            <GlobalSearch isOpen={showSearch} onClose={() => setShowSearch(false)} />
            {children}
          </div>
        </main>
      </div>
    </ProjectLayoutContext.Provider>
  );
}
