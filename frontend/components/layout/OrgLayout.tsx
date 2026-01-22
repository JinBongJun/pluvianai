'use client';

import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, HelpCircle, MessageSquare, Lightbulb, User } from 'lucide-react';
import { clsx } from 'clsx';
import OrgSelector, { getLastSelectedOrgId } from './OrgSelector';
import OrgSidebar from './OrgSidebar';
import { authAPI } from '@/lib/api';

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

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await authAPI.getCurrentUser();
        setUserEmail(user.email || '');
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    };
    loadUser();
  }, []);

  const handleSearchClick = () => {
    // Global search functionality
    const input = document.getElementById('global-search-input');
    if (input) {
      input.focus();
    }
  };

  const handleFeedbackClick = () => {
    // Feedback functionality
    console.log('Feedback clicked');
  };

  const handleHelpClick = () => {
    // Help functionality
    console.log('Help clicked');
  };

  const handleSuggestionsClick = () => {
    // Suggestions functionality
    console.log('Suggestions clicked');
  };

  const handleProfileClick = () => {
    router.push('/settings');
  };

  const handleOrgChange = (newOrgId: number) => {
    router.push(`/organizations/${newOrgId}/projects`);
  };

  return (
    <OrgLayoutContext.Provider value={{ orgId }}>
      <div className="min-h-screen bg-[#000314] text-white">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-[#0A0C14]/90 px-4 backdrop-blur">
          <div className="flex items-center gap-3 text-sm text-white">
            <button
              onClick={() => router.push('/organizations')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="h-8 w-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/50">
                <span className="text-white font-bold text-sm">AG</span>
              </div>
            </button>
            <OrgSelector currentOrgId={orgId} onOrgChange={handleOrgChange} />
            {breadcrumb.length > 0 && (
              <div className="flex items-center gap-2 text-slate-300">
                {breadcrumb.map((item, idx) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className={clsx(idx === 0 && 'text-white font-semibold')}>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="hover:text-white transition-colors"
                          onClick={(e) => {
                            e.preventDefault();
                            router.push(item.href!);
                          }}
                        >
                          {item.label}
                        </a>
                      ) : (
                        item.label
                      )}
                    </span>
                    {idx < breadcrumb.length - 1 && <span className="text-slate-500">/</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-slate-200">
            <button
              onClick={handleFeedbackClick}
              className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
            >
              Feedback
            </button>
            <button
              onClick={handleSearchClick}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
            >
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Search</span>
              <span className="hidden sm:inline text-xs text-slate-400">⌘K</span>
            </button>
            <button
              onClick={handleHelpClick}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden md:inline">Help</span>
            </button>
            <button
              onClick={handleSuggestionsClick}
              className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
            >
              <Lightbulb className="h-4 w-4" />
              <span>Suggestions</span>
            </button>
            <button
              onClick={handleProfileClick}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
            >
              <User className="h-4 w-4" />
              <span className="hidden md:inline">Profile</span>
            </button>
          </div>
        </header>

        {/* Main Layout */}
        <div className="flex">
          {/* Sidebar */}
          <OrgSidebar orgId={orgId} />

          {/* Main Content */}
          <main className="flex-1 ml-64 mt-14">
            <div className="p-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </OrgLayoutContext.Provider>
  );
}
