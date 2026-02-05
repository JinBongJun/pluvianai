'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, HelpCircle, MessageSquare, Lightbulb, User } from 'lucide-react';
import { clsx } from 'clsx';

import ProfileMenu from './ProfileMenu';

interface TopHeaderProps {
  breadcrumb?: { label: string; href?: string }[];
  showSearch?: boolean;
  onSearchClick?: () => void;
  onFeedbackClick?: () => void;
  onHelpClick?: () => void;
  onSuggestionsClick?: () => void;
  userEmail?: string;
  userName?: string;
  userPlan?: string;
  onLogout?: () => void;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export default function TopHeader({
  breadcrumb = [],
  showSearch = true,
  onSearchClick,
  onFeedbackClick,
  onHelpClick,
  onSuggestionsClick,
  userEmail,
  userName,
  userPlan,
  onLogout,
  leftContent,
  rightContent,
}: TopHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-ag-bg/90 px-4 backdrop-blur">
      <div className="flex items-center gap-3 text-sm text-ag-text">
        <button
          onClick={() => router.push('/organizations')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="h-8 w-8 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-lg flex items-center justify-center shadow-glow-neon">
            <span className="text-ag-bg font-bold text-sm">S</span>
          </div>
        </button>
        {leftContent}
        {breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 text-ag-muted">
            <span className="text-ag-muted/50 mx-1">/</span>
            {breadcrumb.map((item, idx) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={clsx(idx === breadcrumb.length - 1 ? 'text-ag-text font-semibold' : 'hover:text-ag-text transition-colors')}>
                  {item.href ? (
                    <Link href={item.href}>
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </span>
                {idx < breadcrumb.length - 1 && <span className="text-ag-muted/50 mx-1">/</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-ag-text">
        {onFeedbackClick && (
          <button
            onClick={onFeedbackClick}
            className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors text-ag-muted hover:text-ag-text"
          >
            Feedback
          </button>
        )}
        {showSearch && (
          <button
            onClick={onSearchClick}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors text-ag-muted hover:text-ag-text"
          >
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">Search</span>
            <span className="hidden sm:inline text-xs opacity-50">⌘K</span>
          </button>
        )}
        <button
          onClick={onHelpClick || (() => router.push('/help'))}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors text-ag-muted hover:text-ag-text"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden md:inline">Help</span>
        </button>
        
        {userEmail && onLogout && (
          <div className="ml-2 border-l border-white/10 pl-4 h-8 flex items-center">
            <ProfileMenu 
              userEmail={userEmail} 
              userName={userName} 
              userPlan={userPlan} 
              onLogout={onLogout} 
            />
          </div>
        )}
        {rightContent}
      </div>
    </header>
  );
}
