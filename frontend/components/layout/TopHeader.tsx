'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, HelpCircle, MessageSquare, Lightbulb, User } from 'lucide-react';
import { clsx } from 'clsx';

interface TopHeaderProps {
  breadcrumb?: { label: string; href?: string }[];
  showSearch?: boolean;
  onSearchClick?: () => void;
  onFeedbackClick?: () => void;
  onHelpClick?: () => void;
  onSuggestionsClick?: () => void;
  onProfileClick?: () => void;
  rightContent?: React.ReactNode;
}

export default function TopHeader({
  breadcrumb = [],
  showSearch = true,
  onSearchClick,
  onFeedbackClick,
  onHelpClick,
  onSuggestionsClick,
  onProfileClick,
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
          <div className="h-8 w-8 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-lg flex items-center justify-center shadow-lg shadow-ag-primary/40">
            <span className="text-ag-accent-light font-bold text-sm">AG</span>
          </div>
        </button>
        {breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 text-ag-muted">
            {breadcrumb.map((item, idx) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={clsx(idx === 0 && 'text-ag-text font-semibold')}>
                  {item.href ? (
                    <Link href={item.href} className="hover:text-ag-text transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </span>
                {idx < breadcrumb.length - 1 && <span className="text-ag-muted/70">/</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-ag-text">
        <button
          onClick={onFeedbackClick}
          className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
        >
          Feedback
        </button>
        {showSearch && (
          <button
            onClick={onSearchClick}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
          >
            <Search className="h-4 w-4" />
            <span className="hidden md:inline">Search</span>
            <span className="hidden sm:inline text-xs text-ag-muted">⌘K</span>
          </button>
        )}
        <button
          onClick={onHelpClick}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden md:inline">Help</span>
        </button>
        <button
          onClick={onSuggestionsClick}
          className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
        >
          <Lightbulb className="h-4 w-4" />
          <span>Suggestions</span>
        </button>
        <button
          onClick={onProfileClick}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm hover:bg-white/5 transition-colors"
        >
          <User className="h-4 w-4" />
          <span className="hidden md:inline">Profile</span>
        </button>
        {rightContent}
      </div>
    </header>
  );
}
