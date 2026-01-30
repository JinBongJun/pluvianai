'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import { organizationsAPI } from '@/lib/api';
import { Plug, Github, Slack, Webhook, Key, ExternalLink } from 'lucide-react';

export default function IntegrationsPage() {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: false }),
  );

  const integrations = [
    {
      id: 'slack',
      name: 'Slack',
      description: 'Get real-time alerts and notifications in your Slack channels',
      icon: Slack,
      connected: false,
      comingSoon: false,
    },
    {
      id: 'github',
      name: 'GitHub Actions',
      description: 'Run AgentGuard CI checks on your pull requests',
      icon: Github,
      connected: false,
      comingSoon: false,
    },
    {
      id: 'webhooks',
      name: 'Webhooks',
      description: 'Send events to your own endpoints',
      icon: Webhook,
      connected: false,
      comingSoon: false,
    },
    {
      id: 'api-keys',
      name: 'API Keys',
      description: 'Manage API keys for SDK integration',
      icon: Key,
      connected: true,
      comingSoon: false,
    },
  ];

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Integrations' },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Plug className="h-8 w-8 text-ag-accent" />
            Integrations
          </h1>
          <p className="text-slate-400 mt-2">Connect AgentGuard with your favorite tools</p>
        </div>

        <div className="grid gap-4">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.id}
                className="rounded-xl border border-white/10 bg-white/5 p-6 flex items-center justify-between hover:border-ag-accent/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white flex items-center gap-2">
                      {integration.name}
                      {integration.comingSoon && (
                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-400">{integration.description}</div>
                  </div>
                </div>
                <div>
                  {integration.connected ? (
                    <button className="px-4 py-2 rounded-lg bg-ag-accent/20 text-ag-accent border border-ag-accent/30 text-sm font-medium hover:bg-ag-accent/30 transition-colors flex items-center gap-2">
                      Configure
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  ) : integration.comingSoon ? (
                    <button
                      disabled
                      className="px-4 py-2 rounded-lg bg-slate-800 text-slate-500 text-sm font-medium cursor-not-allowed"
                    >
                      Coming Soon
                    </button>
                  ) : (
                    <button className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors">
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </OrgLayout>
  );
}
