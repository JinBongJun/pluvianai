'use client';

import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, HelpCircle, MessageSquare, Lightbulb, User } from 'lucide-react';
import { clsx } from 'clsx';
import OrgSelector, { getLastSelectedOrgId } from './OrgSelector';
import OrgSidebar from './OrgSidebar';
import { authAPI } from '@/lib/api';

import TopHeader from './TopHeader';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import GlobalSearch from '@/components/search/GlobalSearch';

interface OrgLayoutContextType {
  orgId: number | string;
}

const OrgLayoutContext = createContext<OrgLayoutContextType | undefined>(undefined);

export function useOrgLayout() {
  const context = useContext(OrgLayoutContext);
  if (!context) {
    throw new Error('useOrgLayout must be used within OrgLayout');
  }
  return context;
}

interface OrgLayoutProps {
  children: ReactNode;
  orgId: number | string;
  breadcrumb?: { label: string; href?: string }[];
}

export default function OrgLayout({ children, orgId, breadcrumb = [] }: OrgLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
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
    <OrgLayoutContext.Provider value={{ orgId }}>
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

        <div className="flex">
          <OrgSidebar orgId={orgId} />
          <main className="flex-1 ml-64 overflow-auto">
            <div className="p-8 max-w-7xl mx-auto">
              <GlobalSearch isOpen={showSearch} onClose={() => setShowSearch(false)} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </OrgLayoutContext.Provider>
  );
}
