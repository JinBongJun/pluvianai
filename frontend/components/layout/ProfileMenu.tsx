'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, CreditCard, Shield, Activity } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { clsx } from 'clsx';

interface ProfileMenuProps {
  userEmail?: string;
  userName?: string;
  userPlan?: string;
  onLogout: () => void;
}

export default function ProfileMenu({ userEmail, userName, userPlan = 'free', onLogout }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    { label: 'Profile', icon: User, href: '/settings/profile' },
    { label: 'Settings', icon: Settings, href: '/settings' },
    { label: 'Billing', icon: CreditCard, href: '/settings/billing' },
    { label: 'Activity', icon: Activity, href: '/settings/activity' },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
      >
        <Avatar name={userName} email={userEmail} size="sm" />
        <span className="hidden md:inline text-sm font-medium text-ag-text">
          {userName || userEmail?.split('@')[0] || 'User'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-white/10 bg-ag-surface shadow-2xl z-50 overflow-hidden animate-fade-in">
          <div className="p-4 border-b border-white/10">
            <p className="text-sm font-semibold text-ag-text truncate">{userName || 'User'}</p>
            <p className="text-xs text-ag-muted truncate">{userEmail}</p>
            <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-ag-accent/20 text-ag-accent">
              {userPlan} plan
            </div>
          </div>

          <div className="p-2">
            {menuItems.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  router.push(item.href);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-ag-muted hover:bg-white/5 hover:text-ag-text transition-colors"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="p-2 border-t border-white/10">
            <button
              onClick={() => {
                onLogout();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
