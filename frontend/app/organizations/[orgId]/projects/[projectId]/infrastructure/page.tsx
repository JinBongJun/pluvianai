"use client";

import React, { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import ProjectLayout from "@/components/layout/ProjectLayout";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import { projectsAPI, organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import {
  buildCanonicalProjectPath,
  getProjectScopeMismatchOrgId,
} from "@/lib/projectRouteScope";
import {
  Zap,
  Copy,
  Check,
  Server,
  ShieldCheck,
  AlertCircle,
  Terminal,
  Cpu,
  Database,
  Globe,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import Button from "@/components/ui/Button";

function InfrastructureHubPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { orgId, projectId } = useOrgProjectParams();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const { data: project } = useSWR(
    projectId ? ["project", projectId] : null,
    async () => {
      try {
        return await projectsAPI.get(projectId, { expectedOrgId: orgId });
      } catch (e: any) {
        const actualOrgId = getProjectScopeMismatchOrgId(e);
        if (actualOrgId && pathname) {
          router.replace(
            buildCanonicalProjectPath(
              pathname,
              orgId,
              actualOrgId,
              projectId,
              searchParams?.toString() ? `?${searchParams.toString()}` : ""
            )
          );
          return undefined;
        }
        const status = e?.response?.status;
        const msg = e?.response?.data?.detail ?? e?.response?.data?.error?.message ?? "";
        if (status === 404 && (msg === "Project not found" || msg === "Not Found")) {
          router.replace(orgId ? `/organizations/${orgId}/projects` : "/organizations");
          return undefined;
        }
        throw e;
      }
    }
  );
  const { data: org } = useSWR(orgId ? orgKeys.detail(orgId) : null, () =>
    organizationsAPI.get(orgId)
  );

  // Placeholder for Sentinel health status fetch
  const { data: sentinelStatus } = useSWR(
    projectId ? `/api/v1/infrastructure/projects/${projectId}/sentinel/status` : null,
    async () => {
      // simulate API call
      return { sentinel_online: false };
    }
  );

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const dockerCommand = `docker run -it --rm \\
  --name pluvian-sentinel \\
  -e PLUVIAN_PROJECT_ID=${projectId} \\
  -e PLUVIAN_API_KEY=YOUR_API_KEY \\
  -p 5678:5678 \\
  pluvianai/sentinel:latest`;

  const sdkSetup = `from pluvian import monitor

# Initialize deterministic sentinel mapping
monitor.start(
    project_id=${projectId},
    api_key="YOUR_API_KEY",
    sentinel_url="http://localhost:5678"
)`;

  return (
    <ProjectLayout
      orgId={orgId}
      projectId={projectId}
      breadcrumb={[
        { label: org?.name || "Organization", href: `/organizations/${orgId}/projects` },
        { label: "Infrastructure Hub" },
      ]}
    >
      <div className="max-w-6xl mx-auto space-y-12 pb-20">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-500/30">
              <Zap className="w-6 h-6 text-sky-400" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight uppercase italic">
              Infrastructure <span className="text-sky-500">Hub</span>
            </h1>
          </div>
          <p className="text-slate-400 max-w-2xl text-lg">
            Transition from probabilistic reverse engineering to 100% deterministic AI mapping with
            <span className="text-white font-bold"> Pluvian Sentinel</span>.
          </p>
        </div>

        {/* Status Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl relative overflow-hidden group"
          >
            <div
              className={`absolute top-0 right-0 p-4 ${sentinelStatus?.sentinel_online ? "text-emerald-500" : "text-slate-600"}`}
            >
              <div
                className={clsx(
                  "w-3 h-3 rounded-full animate-pulse shadow-[0_0_15px_rgba(0,0,0,1)]",
                  sentinelStatus?.sentinel_online ? "bg-emerald-500" : "bg-slate-700"
                )}
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-400">
                <Server className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Sentinel Status
                </span>
              </div>
              <h3 className="text-2xl font-bold text-white uppercase italic">
                {sentinelStatus?.sentinel_online ? "CONNECTED" : "STANDBY"}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {sentinelStatus?.sentinel_online
                  ? "Local collector is correctly reporting deterministic mapping."
                  : "No active Sentinel detected for this project yet."}
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-400">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Mapping Accuracy
                </span>
              </div>
              <h3 className="text-2xl font-bold text-white uppercase italic tracking-tighter">
                {sentinelStatus?.sentinel_online ? "100% CRYSTAL" : "85% ESTIMATED"}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Sentinel integration eliminates all probabilistic mapping artifacts.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 rounded-3xl bg-sky-500/[0.05] border border-sky-500/20 backdrop-blur-xl"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sky-400">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Latency Optimization
                </span>
              </div>
              <h3 className="text-2xl font-bold text-white uppercase italic">REAL-TIME</h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Local diagnostics reduce round-trip overhead for clinical scans.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Installation Guides */}
        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Terminal className="w-6 h-6 text-sky-500" />
            Deployment Guide
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Step 1: Docker */}
            <div className="p-8 rounded-[40px] bg-[#1a1a1c] border border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-black">
                    1
                  </div>
                  <h3 className="text-xl font-bold text-white">Docker Sentinel</h3>
                </div>
                <button
                  onClick={() => copyToClipboard(dockerCommand, "docker")}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-all"
                >
                  {copiedSection === "docker" ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-sm text-slate-400 italic">
                Spin up a local security collector to intercept and analyze neural traffic with ZERO
                data leaks.
              </p>
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-sky-500/10 to-transparent blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <pre className="p-6 rounded-2xl bg-black/40 text-sky-400 font-mono text-xs leading-relaxed overflow-x-auto border border-white/5">
                  {dockerCommand}
                </pre>
              </div>
            </div>

            {/* Step 2: SDK */}
            <div className="p-8 rounded-[40px] bg-[#1a1a1c] border border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-black">
                    2
                  </div>
                  <h3 className="text-xl font-bold text-white">Neural Hook (SDK)</h3>
                </div>
                <button
                  onClick={() => copyToClipboard(sdkSetup, "sdk")}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-all"
                >
                  {copiedSection === "sdk" ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-sm text-slate-400 italic">
                Enable deterministic self-reporting within your agent code to synchronize
                architecture in real-time.
              </p>
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-violet-500/10 to-transparent blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <pre className="p-6 rounded-2xl bg-black/40 text-violet-400 font-mono text-xs leading-relaxed overflow-x-auto border border-white/5">
                  {sdkSetup}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Features Comparison */}
        <div className="p-10 rounded-[50px] bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                Why switch to <br />{" "}
                <span className="text-sky-500 italic uppercase italic uppercase italic uppercase italic lowercase">
                  Deterministic
                </span>{" "}
                Mapping?
              </h2>
              <div className="space-y-4">
                {[
                  {
                    title: "Zero Guesswork",
                    desc: "Agents explicitly declare their position in the neural chain.",
                  },
                  {
                    title: "Local Privacy",
                    desc: "Sensitive payload analysis stays within your firewall.",
                  },
                  {
                    title: "Deep Traceability",
                    desc: "Track tokens and latency with microsecond precision.",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0 mt-1">
                      <div className="w-2 h-2 rounded-full bg-sky-500" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm tracking-tight">{item.title}</h4>
                      <p className="text-xs text-slate-500 font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-3xl bg-slate-900 border border-white/5 overflow-hidden flex items-center justify-center p-8">
                {/* Visual Representation of Sentinel Connection */}
                <div className="relative w-full h-full flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="absolute w-40 h-40 bg-sky-500/20 rounded-full blur-3xl"
                  />
                  <div className="flex flex-col items-center gap-8 z-10">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <Cpu className="w-8 h-8 text-sky-400" />
                      <div className="text-left">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          Neural Agent
                        </div>
                        <div className="text-sm font-bold text-white tracking-tight">
                          Agent_Alpha_v2
                        </div>
                      </div>
                    </div>
                    <motion.div
                      animate={{ height: [40, 60, 40] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-[2px] bg-sky-500/30 relative"
                    >
                      <motion.div
                        animate={{ top: ["0%", "100%"] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        className="absolute w-2 h-2 bg-sky-400 rounded-full -left-[3px] shadow-[0_0_10px_rgba(56,189,248,1)]"
                      />
                    </motion.div>
                    <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-400/30 flex items-center gap-3">
                      <Zap className="w-8 h-8 text-sky-400" />
                      <div className="text-left">
                        <div className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">
                          SENTINEL NODE
                        </div>
                        <div className="text-sm font-bold text-white tracking-tight">
                          Active_Mapping
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}

export default function InfrastructureHubPage() {
  return (
    <Suspense fallback={null}>
      <InfrastructureHubPageContent />
    </Suspense>
  );
}
