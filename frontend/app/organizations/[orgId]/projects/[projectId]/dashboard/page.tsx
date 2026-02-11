'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import CanvasPageLayout from '@/components/layout/CanvasPageLayout';
import { projectsAPI, organizationsAPI } from '@/lib/api';
import { Activity, Zap, ShieldCheck, Database } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DashboardPage() {
  const params = useParams();
  const orgId = params?.orgId as string;
  const projectId = Number(params?.projectId);

  const { data: project } = useSWR(projectId ? ['project', projectId] : null, () => projectsAPI.get(projectId));
  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () => organizationsAPI.get(orgId));

  const stats = [
    { label: 'Active Agents', value: '12', icon: Activity, color: 'text-emerald-400' },
    { label: 'Avg Latency', value: '420ms', icon: Zap, color: 'text-cyan-400' },
    { label: 'Safety Score', value: '98.2%', icon: ShieldCheck, color: 'text-emerald-500' },
    { label: 'Total Snapshots', value: '1.2k', icon: Database, color: 'text-slate-400' },
  ];

  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={project?.name}
      orgName={org?.name}
      activeTab="dashboard"
      mode="PULSE"
      status="LIVE"
      onAction={(actionId) => console.log('HUD Action:', actionId)}
    >
      <div className="flex-1 p-8 space-y-10 bg-[#0a0a0c] relative overflow-hidden">
        {/* Background Decorative Element */}
        {/* Main Content Area (Ready for Charts/Maps) */}
        <div className="flex-1 flex flex-col gap-8 min-h-0">
          <div className="flex-1 min-h-[500px] rounded-3xl border border-white/5 bg-white/5 backdrop-blur-md overflow-hidden relative flex items-center justify-center group">
            <div className="absolute inset-0 bg-flowing-lines opacity-10 pointer-events-none" />
            <div className="text-center space-y-6 max-w-lg px-8">
              <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 inline-block">
                <Activity className="w-10 h-10 text-emerald-500 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight uppercase italic">Neural Network Offline</h2>
                <p className="text-sm font-mono text-slate-500 uppercase tracking-widest leading-relaxed">
                  No active telemetry detected. Connect your system via the AgentGuard SDK to initialize the visualization engine.
                </p>
              </div>
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl text-left inline-block">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Terminal Integration</p>
                <code className="text-sm text-emerald-500 font-mono">npm install @agentguard/sdk</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CanvasPageLayout>
  );
}
