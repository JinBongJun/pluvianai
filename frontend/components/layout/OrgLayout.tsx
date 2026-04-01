import React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Settings,
  Activity,
  Users,
  LayoutDashboard,
  ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import TopHeader from "./TopHeader";
import useSWR from "swr";
import { organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { OrganizationProject, OrganizationSummary } from "@/lib/api/types";
import { canManageOrganization } from "@/lib/organizationAccess";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface Tab {
  id: string;
  label: string;
  href: string;
}

interface OrgLayoutProps {
  orgId?: string | number;
  breadcrumb?: Breadcrumb[];
  tabs?: Tab[];
  projects?: OrganizationProject[];
  children: React.ReactNode;
}

const OrgLayout: React.FC<OrgLayoutProps> = ({ orgId, breadcrumb, tabs, projects, children }) => {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const resolvedOrgId = orgId || params.orgId;
  const resolvedOrgKey = resolvedOrgId ? String(resolvedOrgId) : null;
  const hasToken = useRequireAuth();
  const { data: currentUser } = useCurrentUser(hasToken);

  const { data: organizations } = useSWR<OrganizationSummary[]>(
    hasToken ? orgKeys.list() : null,
    () => organizationsAPI.list({ includeStats: false }),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  );
  const activeOrg = organizations?.find(o => String(o.id) === String(resolvedOrgKey));
  const canManageOrganizationNav = canManageOrganization(activeOrg?.currentUserRole);

  const orgNavItems = canManageOrganizationNav
    ? [
        {
          label: "Organization Settings",
          desc: "Org & model configuration",
          href: `/organizations/${resolvedOrgId}/settings`,
          icon: Settings,
        },
        {
          label: "Team & Access",
          desc: "Members & roles",
          href: `/organizations/${resolvedOrgId}/team`,
          icon: Users,
        },
      ]
    : [];

  const navItems = [
    {
      label: "Projects",
      desc: "Agent workspaces",
      href: `/organizations/${resolvedOrgId}/projects`,
      icon: LayoutDashboard,
    },
    ...orgNavItems,
  ];

  return (
    <div className="min-h-screen text-white selection:bg-emerald-500/30 font-sans relative overflow-hidden">
      {/* Global Antigravity Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#030303]">
        {/* Deep space radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-50" />

        {/* ====== Landing Page Ported Atmosphere ====== */}

        {/* 1. Global Diagonal Curtain Lights */}
        <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[500px] bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent -rotate-[35deg] blur-[100px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[20%] left-[-20%] w-[150%] h-[600px] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent -rotate-[35deg] blur-[120px] pointer-events-none mix-blend-screen" />

        {/* 2. Geometric Light Beams (Ported from Hero) */}
        {/* Left Beam */}
        <div
          className="absolute top-1/2 -left-[20%] w-[40%] h-[120%] -translate-y-1/2 rounded-[100%] pointer-events-none opacity-40
            border-r-[2px] border-cyan-400/30 
            bg-gradient-to-l from-cyan-500/20 via-transparent to-transparent 
            shadow-[inset_-20px_0_100px_rgba(34,211,238,0.2)] mix-blend-screen"
        />

        {/* Right Beam */}
        <div
          className="absolute top-1/2 -right-[20%] w-[40%] h-[120%] -translate-y-1/2 rounded-[100%] pointer-events-none opacity-30
            border-l-[2px] border-emerald-400/30 
            bg-gradient-to-r from-emerald-500/20 via-transparent to-transparent 
            shadow-[inset_20px_0_100px_rgba(16,185,129,0.2)] mix-blend-screen"
        />

        {/* 3. High-Density Floating Particles */}
        {/* Cyan Particles */}
        <div className="absolute top-[10%] left-[30%] w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />

        {/* Emerald Particles */}
        <div className="absolute top-[40%] right-[15%] w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-bounce duration-[3000ms]" />
        <div className="absolute bottom-[10%] right-[30%] w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />

        {/* White Highlights */}
        <div className="absolute top-[15%] right-[40%] w-1 h-1 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
        <div className="absolute bottom-[30%] left-[45%] w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)] opacity-50" />

        {/* 4. Vector Capsules for Depth */}
        <div className="absolute top-[100px] -left-[100px] w-[300px] h-[600px] border-[1px] border-white/10 rounded-r-full opacity-20 pointer-events-none" />
        <div className="absolute bottom-[100px] -right-[150px] w-[400px] h-[800px] border-[1px] border-white/5 rounded-l-full opacity-30 pointer-events-none" />

        {/* Original Dusty Layers */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjE1KSIvPjxjaXJjbGUgY3g9IjE4MCIgY3k9IjEyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PGNpcmNsZSBjeD0iMzIwIiBjeT0iODAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjMyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjI1KSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iMjgwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMTUpIi8+PGNpcmNsZSBjeD0iMzcwIiBjeT0iMjIwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] bg-[size:300px_300px] opacity-40" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMTUwIiBjeT0iMTUwIiByPSIyIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMykiLz48Y2lyY2xlIGN4PSI2NTAiIGN5PSI0NTAiIHI9IjEuNSIgZmlsbD0icmdiYSg2LDE4MiwyMTIsMC41KSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjY1MCIgcj0iMiIgZmlsbD0icmdiYSgxNiwxODUsMTI5LDAuNCkiLz48Y2lyY2xlIGN4PSI1NTAiIGN5PSIyNTAiIHI9IjIuNSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PC9zdmc+')] bg-[size:800px_800px] opacity-60" />

        {/* Anamorphic Flare Line */}
        <div className="absolute top-[40%] left-[-10%] w-[120%] h-[2px] bg-cyan-500/20 blur-[2px] -rotate-12 pointer-events-none mix-blend-screen" />
      </div>

      <TopHeader
        userName={currentUser?.full_name || ""}
        userEmail={currentUser?.email || ""}
        organizations={organizations}
        projects={projects}
      />

      {/* Scientific Sidebar */}
      <aside className="fixed top-[90px] left-0 w-80 h-[calc(100vh-90px)] border-r border-white/5 bg-[#030303]/20 backdrop-blur-2xl z-40 overflow-hidden">
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 bg-flowing-lines opacity-[0.03] pointer-events-none" />

        <div className="relative z-10 p-8 flex flex-col h-full bg-gradient-to-b from-transparent to-black/20">
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
              Agent Operations
            </div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-tight drop-shadow-lg">
              AGENT OPS
            </h2>
          </div>

          <nav className="flex-1 space-y-4">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || (item.href !== "/docs" && pathname.startsWith(item.href));
              const isOrgSectionStart = index === 1;

              return (
                <div key={item.href} className={isOrgSectionStart ? "mt-6" : ""}>
                  {isOrgSectionStart && (
                    <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Organization
                    </p>
                  )}
                  <button
                    onClick={() => router.push(item.href)}
                    className={clsx(
                    "w-full flex items-center gap-5 p-5 rounded-[24px] transition-all group border border-transparent backdrop-blur-md",
                    isActive
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_40px_-10px_rgba(16,185,129,0.2)]"
                      : "hover:bg-white/5 text-slate-500 hover:text-white"
                  )}
                >
                  <div
                    className={clsx(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-all flex-shrink-0",
                      isActive
                        ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                        : "bg-white/5 group-hover:bg-white/10"
                    )}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-base font-black uppercase tracking-wider">{item.label}</p>
                    <p className="text-[11px] font-bold opacity-60 uppercase tracking-tight truncate w-40">
                      {item.desc}
                    </p>
                  </div>
                  {isActive && <ChevronRight className="w-5 h-5 text-emerald-400" />}
                </button>
                </div>
              );
            })}
          </nav>

          <div className="mt-auto pt-8 border-t border-white/5">
            <div className="p-6 rounded-[24px] bg-[#121215]/60 border border-white/5 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-emerald-500/5 opacity-20 animate-pulse" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    PluvianAI
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase leading-relaxed">
                  All activity is logged.
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-80 pt-[90px] relative z-10">
        <div className="w-full max-w-[1700px] mx-auto p-12 lg:p-16 xl:p-20">{children}</div>
      </div>
    </div>
  );
};

export default OrgLayout;
