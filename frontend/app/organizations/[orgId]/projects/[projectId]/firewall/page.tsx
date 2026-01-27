'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import OrgLayout from '@/components/layout/OrgLayout';
import ProjectTabs from '@/components/ProjectTabs';
import FirewallRules from '@/components/firewall/FirewallRules';
import { firewallAPI, adminAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';
import { Shield, AlertTriangle } from 'lucide-react';

export default function FirewallPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [panicMode, setPanicMode] = useState(false);
  const [loadingPanic, setLoadingPanic] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    if (!projectId || isNaN(projectId) || projectId <= 0) {
      router.push(`/organizations/${orgId}/projects`);
      return;
    }

    checkAdminAndPanicMode();
  }, [projectId, orgId, router]);

  const checkAdminAndPanicMode = async () => {
    try {
      // Check if user is admin (try to get panic mode status)
      try {
        const status = await firewallAPI.getPanicModeStatus();
        setIsAdmin(true);
        setPanicMode(status.enabled);
      } catch (error: any) {
        // Not admin or error
        setIsAdmin(false);
      }
    } catch (error) {
      // Ignore
    } finally {
      setLoadingPanic(false);
    }
  };

  const handleTogglePanicMode = async () => {
    try {
      const newStatus = !panicMode;
      await firewallAPI.togglePanicMode(newStatus);
      setPanicMode(newStatus);
      toast.showToast(`Panic mode ${newStatus ? 'enabled' : 'disabled'}`, 'success');
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to toggle panic mode',
        'error'
      );
    }
  };

  return (
    <OrgLayout orgId={orgId}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProjectTabs projectId={projectId} orgId={orgId} canManage={true} />

        <div className="space-y-6">
          {isAdmin && (
            <div className="bg-dark-card rounded-lg border border-dark-border p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-orange-500" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Global Panic Mode</h3>
                    <p className="text-sm text-slate-400">
                      {panicMode
                        ? 'All traffic is currently blocked across all projects'
                        : 'Enable to block all traffic across all projects'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleTogglePanicMode}
                  disabled={loadingPanic}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    panicMode
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
                      : 'bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 border border-slate-500/30'
                  }`}
                >
                  {loadingPanic ? 'Loading...' : panicMode ? 'Disable Panic Mode' : 'Enable Panic Mode'}
                </button>
              </div>
            </div>
          )}

          <FirewallRules projectId={projectId} />
        </div>
      </div>
    </OrgLayout>
  );
}
