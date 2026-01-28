'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RuleMarketList from '@/components/rule-market/RuleMarketList';

export default function RuleMarketPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    // Rule Market is public, but we check token for authenticated features
  }, []);

  return (
    <div className="min-h-screen bg-ag-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Rule Market</h1>
          <p className="text-slate-400">
            Discover and share firewall rules with the community
          </p>
        </div>

        <RuleMarketList />
      </div>
    </div>
  );
}
