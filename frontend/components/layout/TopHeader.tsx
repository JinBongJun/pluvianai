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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-[#0A0C14]/90 px-4 backdrop-blur">
      <div className="flex items-center gap-3 text-sm text-white">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="h-8 w-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/50">
            <span className="text-white font-bold text-sm">AG</span>
          </div>
        </button>
        {breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 text-slate-300">
            {breadcrumb.map((item, idx) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={clsx(idx === 0 && 'text-white font-semibold')}>
                  {item.href ? (
                    <Link href={item.href} className="hover:text-white transition-colors">
                      {item.label}
                    </Link>
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
            <span className="hidden sm:inline text-xs text-slate-400">⌘K</span>
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
