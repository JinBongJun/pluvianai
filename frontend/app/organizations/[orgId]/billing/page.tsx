'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import { Button } from '@/components/ui/Button';
import { organizationsAPI } from '@/lib/api';
import { CreditCard, Check, Zap } from 'lucide-react';

export default function BillingPage() {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: true }),
  );

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: '/month',
      features: ['3 projects', '10,000 API calls/month', '7-day data retention', 'Community support'],
      current: org?.plan === 'free' || !org?.plan,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$49',
      period: '/month',
      features: ['Unlimited projects', '100,000 API calls/month', '30-day data retention', 'Priority support', 'Advanced analytics'],
      current: org?.plan === 'pro',
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      features: ['Everything in Pro', 'Unlimited API calls', '90-day data retention', 'Dedicated support', 'SLA guarantee', 'SSO/SAML'],
      current: org?.plan === 'enterprise',
    },
  ];

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Billing' },
      ]}
    >
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-ag-accent" />
            Billing
          </h1>
          <p className="text-slate-400 mt-2">Manage your subscription and billing</p>
        </div>

        {/* Usage summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-400 mb-1">API calls (7d)</div>
            <div className="text-xl font-bold text-white">{org?.calls7d?.toLocaleString() ?? '0'}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-400 mb-1">Projects</div>
            <div className="text-xl font-bold text-white">{org?.projects ?? 0}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-400 mb-1">Cost (7d)</div>
            <div className="text-xl font-bold text-white">${org?.cost7d?.toFixed(2) ?? '0.00'}</div>
          </div>
        </div>

        {/* Current Plan */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-2">Current Plan</h2>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-ag-accent capitalize">
              {org?.plan || 'Free'}
            </span>
            <span className="text-sm text-slate-400">plan</span>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 ${
                plan.popular
                  ? 'border-ag-accent bg-ag-accent/5'
                  : 'border-white/10 bg-white/5'
              } ${plan.current ? 'ring-2 ring-ag-accent' : ''}`}
            >
              {plan.popular && (
                <div className="flex items-center gap-1 text-ag-accent text-sm font-medium mb-4">
                  <Zap className="h-4 w-4" />
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <div className="mt-2 mb-6">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                <span className="text-slate-400">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="h-4 w-4 text-ag-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.current ? (
                <Button variant="secondary" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : plan.id === 'enterprise' ? (
                <Button variant="secondary" className="w-full">
                  Contact Sales
                </Button>
              ) : (
                <Button variant="primary" className="w-full">
                  Upgrade
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </OrgLayout>
  );
}
