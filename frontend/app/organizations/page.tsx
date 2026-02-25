'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import TopHeader from '@/components/layout/TopHeader';
import { organizationsAPI } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { Plus, Search, Building2, Briefcase } from 'lucide-react';

export default function OrganizationsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  useEffect(() => {
    const loadUser = async () => {
      try {
        if (typeof window === 'undefined') return;

        const accessToken = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');
        const hasTokens = !!(accessToken && accessToken !== 'undefined');

        let userInfo: { email?: string; full_name?: string } | null = null;
        const storedUser = localStorage.getItem('user_info');
        if (storedUser) {
          try {
            userInfo = JSON.parse(storedUser);
          } catch {
            // ignore parse error
          }
        }

        if (!userInfo && hasTokens && accessToken) {
          try {
            const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            userInfo = { email: payload.email ?? 'user', full_name: payload.full_name ?? '' };
            localStorage.setItem('user_info', JSON.stringify(userInfo));
          } catch {
            userInfo = { email: 'user', full_name: '' };
          }
        }

        if (!userInfo && !hasTokens) {
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            setTimeout(loadUser, 300);
            return;
          }
          router.push('/login?reauth=1');
          return;
        }

        setUserEmail(userInfo?.email || '');
        setUserName(userInfo?.full_name || '');
        setAuthReady(true);
      } catch (error) {
        console.error('🔴 [OrganizationsPage] Error in loadUser:', error);
        router.push('/login?reauth=1');
      }
    };

    setTimeout(loadUser, 100);
  }, [router]);

  // Same SWR key as TopHeader so one request only (no duplicate 401)
  const { data: orgs, mutate } = useSWR(
    authReady ? 'organizations' : null,
    () => organizationsAPI.list({ includeStats: false }),
  );

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) => org.name.toLowerCase().includes(q));
  }, [debouncedQuery, orgs]);

  return (
    <div className="min-h-screen text-white selection:bg-emerald-500/30">
      {/* Remove local opaque backgrounds to show global animated grid */}

      <TopHeader userName={userName} userEmail={userEmail} />

      <main className="pt-44 pb-32 px-12 max-w-[1400px] mx-auto relative z-10">
        {process.env.NODE_ENV === 'development' && (
          <p className="mb-4 text-xs text-slate-500 font-mono">
            API: {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
            {!(process.env.NEXT_PUBLIC_API_URL || '').includes('railway') && (process.env.NEXT_PUBLIC_API_URL || '').includes('localhost') && (
              <span className="ml-2 text-amber-400">· Railway 쓰려면 .env.local에 NEXT_PUBLIC_API_URL=Railway URL 설정 후 재시작</span>
            )}
          </p>
        )}
        <div className="mb-16">
          <h1 className="text-5xl md:text-6xl font-black text-white mb-12 tracking-tighter uppercase whitespace-nowrap">
            Your Organizations
          </h1>

          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-500 transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for an authorized laboratory"
                className="w-full h-16 pl-14 pr-6 bg-white/[0.02] border border-white/10 rounded-xl text-lg font-bold text-white placeholder-slate-700 focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
              />
            </div>

            <button
              onClick={() => router.push('/organizations/new')}
              className="h-16 px-10 bg-emerald-500 hover:bg-emerald-400 text-black text-lg font-black rounded-xl shadow-[0_0_25px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest whitespace-nowrap"
            >
              <Plus className="w-5 h-5 inline-block mr-2" />
              <span>New organization</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {filtered.map((org) => (
            <button
              key={org.id}
              onClick={() => router.push(`/organizations/${org.id}/projects`)}
              className="flex items-center gap-8 p-10 bg-[#111115]/40 backdrop-blur-3xl border border-white/10 rounded-[32px] hover:border-emerald-400/30 transition-all group text-left relative overflow-hidden active:scale-[0.98] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)]"
            >
              {/* Secondary Internal Glass Layer (The "Box Behind") */}
              <div className="absolute inset-2 bg-white/[0.02] border border-white/5 rounded-[24px] pointer-events-none z-0 group-hover:bg-white/[0.04] transition-colors" />

              {/* Animated Cinematic Grid & Scanlines - INCREASED VISIBILITY */}
              <div className="absolute inset-0 bg-flowing-lines opacity-[0.15] group-hover:opacity-[0.4] transition-all duration-500 pointer-events-none z-0" />

              {/* Glass Refraction / Thickness highlight */}
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50 z-0" />

              <div className="absolute inset-0 bg-emerald-500 opacity-0 group-hover:opacity-[0.05] transition-opacity z-0" />
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-0" />

              <div className="w-20 h-20 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all shadow-inner scale-105 group-hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] z-10">
                <Building2 className="w-10 h-10" />
              </div>

              <div className="flex-1 ml-2 z-10">
                <h3 className="text-2xl font-black text-white mb-2 tracking-tight group-hover:text-emerald-400 transition-colors uppercase leading-none">
                  {org.name}
                </h3>
                <div className="flex items-center gap-4 text-xs font-black text-slate-500 uppercase tracking-widest mt-3">
                  <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[10px] border border-emerald-500/20">{org.plan || 'Free'} Plan</span>
                  <span className="opacity-30">•</span>
                  <span className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Briefcase className="w-3.5 h-3.5" />
                    {org.projects || 0} Projects
                  </span>
                </div>
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full py-32 text-center border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.01]">
              <p className="text-slate-600 text-xl font-bold uppercase tracking-widest">No laboratories found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
