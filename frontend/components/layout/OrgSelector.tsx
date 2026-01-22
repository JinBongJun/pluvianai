'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { organizationsAPI, OrganizationSummary } from '@/lib/api';
import useSWR from 'swr';

interface OrgSelectorProps {
  currentOrgId: number | string;
  onOrgChange?: (orgId: number) => void;
}

const LAST_SELECTED_ORG_KEY = 'lastSelectedOrgId';

export default function OrgSelector({ currentOrgId, onOrgChange }: OrgSelectorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const { data: orgs, error } = useSWR<OrganizationSummary[]>(
    'organizations-list',
    () => organizationsAPI.list({ includeStats: false }),
  );

  const currentOrg = orgs?.find((org) => org.id === Number(currentOrgId));

  const handleOrgSelect = (orgId: number) => {
    localStorage.setItem(LAST_SELECTED_ORG_KEY, String(orgId));
    setIsOpen(false);
    if (onOrgChange) {
      onOrgChange(orgId);
    } else {
      router.push(`/organizations/${orgId}/projects`);
    }
  };

  if (error || !orgs || orgs.length === 0) {
    return (
      <button
        onClick={() => router.push('/organizations')}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
      >
        <span>Organizations</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:bg-white/5 transition-colors"
      >
        <span className="font-semibold">{currentOrg?.name || 'Select organization'}</span>
        <span className="text-xs text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
          {currentOrg?.plan === 'free' ? 'Free' : currentOrg?.plan === 'pro' ? 'Pro' : currentOrg?.plan === 'enterprise' ? 'Enterprise' : 'Free'}
        </span>
        <ChevronDown className={clsx('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-64 rounded-lg border border-white/10 bg-[#0B0C15] shadow-xl z-20 overflow-hidden">
            <div className="p-2">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleOrgSelect(org.id)}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left',
                    org.id === Number(currentOrgId)
                      ? 'bg-purple-500/20 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{org.name}</div>
                    <div className="text-xs text-slate-400">{org.projects ?? 0} projects</div>
                  </div>
                  {org.id === Number(currentOrgId) && (
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 p-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/organizations');
                }}
                className="w-full px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/5 transition-colors text-left"
              >
                Manage organizations →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function getLastSelectedOrgId(): number | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LAST_SELECTED_ORG_KEY);
  return stored ? Number(stored) : null;
}
