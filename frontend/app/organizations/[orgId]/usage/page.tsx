'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import { organizationsAPI } from '@/lib/api';
import { BarChart3, Activity, Zap, TrendingUp } from 'lucide-react';

export default function UsagePage() {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: true }),
  );

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Usage' },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-ag-accent" />
            Usage
          </h1>
          <p className="text-slate-400 mt-2">Monitor your organization&apos;s API usage and limits</p>
        </div>

        {/* Usage Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-5 w-5 text-blue-400" />
              <span className="text-sm text-slate-400">API Calls (This Month)</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {org?.calls7d?.toLocaleString() || '0'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              <span className="text-sm text-slate-400">Projects</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {org?.projects || 0}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <span className="text-sm text-slate-400">Total Cost (7d)</span>
            </div>
            <div className="text-3xl font-bold text-white">
              ${org?.cost7d?.toFixed(2) || '0.00'}
            </div>
          </div>
        </div>

        {/* Plan Limits */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Plan Limits</h2>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">API Calls</span>
                <span className="text-white">
                  {org?.calls7d?.toLocaleString() || '0'} / 10,000
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-ag-accent rounded-full transition-all"
                  style={{ width: `${Math.min(((org?.calls7d || 0) / 10000) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Projects</span>
                <span className="text-white">
                  {org?.projects || 0} / 5
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(((org?.projects || 0) / 5) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Team Members</span>
                <span className="text-white">1 / 3</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: '33%' }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-sm text-slate-400">
              Need more? <a href="#" className="text-ag-accent hover:underline">Upgrade your plan</a>
            </p>
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
