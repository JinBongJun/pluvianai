'use client';

import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { User, Lock, Key, Bell, CreditCard, Activity, Link2, BarChart3 } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();

  const settingsItems = [
    {
      title: 'Profile',
      description: 'Manage your profile information and account settings',
      icon: User,
      href: '/settings/profile',
      color: 'text-blue-600 bg-blue-50',
    },
    {
      title: 'Security',
      description: 'Change your password and manage security settings',
      icon: Lock,
      href: '/settings/security',
      color: 'text-green-600 bg-green-50',
    },
    {
      title: 'API Keys',
      description: 'Manage API keys for programmatic access',
      icon: Key,
      href: '/settings/api-keys',
      color: 'text-purple-600 bg-purple-50',
    },
    {
      title: 'Notifications',
      description: 'Configure email and in-app notification preferences',
      icon: Bell,
      href: '/settings/notifications',
      color: 'text-orange-600 bg-orange-50',
    },
    {
      title: 'Billing',
      description: 'Manage your subscription and billing information',
      icon: CreditCard,
      href: '/settings/billing',
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      title: 'Webhooks',
      description: 'Configure webhooks for external integrations',
      icon: Link2,
      href: '/settings/webhooks',
      color: 'text-purple-600 bg-purple-50',
    },
    {
      title: 'Activity Log',
      description: 'View your account activity history',
      icon: Activity,
      href: '/settings/activity',
      color: 'text-ag-muted bg-white/5',
    },
    {
      title: 'Monitoring',
      description: 'View system metrics and monitoring dashboards',
      icon: BarChart3,
      href: '/settings/monitoring',
      color: 'text-cyan-600 bg-cyan-50',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 text-ag-text">
        <div>
          <h1 className="text-3xl font-bold text-ag-text">Settings</h1>
          <p className="text-ag-muted mt-1">Manage your account settings and preferences</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="bg-ag-surface rounded-lg border border-white/10 p-6 text-left hover:border-white/20 transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-white/5 text-ag-accent">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-ag-text mb-1">
                      {item.title}
                    </h3>
                    <p className="text-sm text-ag-muted">
                      {item.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}

