"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  HelpCircle,
  MessageSquare,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Building2,
  LayoutGrid,
  Plus,
  BarChart3,
  CreditCard,
} from "lucide-react";
import FeedbackModal from "@/components/modals/FeedbackModal";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { authAPI } from "@/lib/api/auth";
import SwitcherDropdown from "@/components/ui/SwitcherDropdown";
import type { OrganizationProject, OrganizationSummary } from "@/lib/api/types";
import { canManageOrganization } from "@/lib/organizationAccess";
import PluvianLogoMark from "@/components/brand/PluvianLogoMark";

interface TopHeaderProps {
  breadcrumb?: { label: string; href?: string }[];
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
  nav?: React.ReactNode;
  organizations?: OrganizationSummary[];
  projects?: OrganizationProject[];
}

const TopHeader: React.FC<TopHeaderProps> = ({
  userName,
  userEmail,
  onLogout,
  nav,
  organizations: providedOrganizations,
  projects: providedProjects,
}) => {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const currentOrgId = params?.orgId;
  const currentProjectId = params?.projectId;

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const organizations = providedOrganizations;
  const resolvedProjects = providedProjects;

  const activeOrg = organizations?.find(o => String(o.id) === String(currentOrgId));
  const activeProject = resolvedProjects?.find(p => String(p.id) === String(currentProjectId));
  const canCreateProjects = canManageOrganization(activeOrg?.currentUserRole);

  const orgSwitcherItems =
    organizations?.map(org => ({
      id: org.id,
      name: org.name,
      href: `/organizations/${org.id}/projects`,
      badge: org.plan?.toUpperCase(),
    })) || [];

  const projectSwitcherItems =
    resolvedProjects
      ?.filter(p => p.has_project_access !== false)
      .map(p => ({
        id: p.id,
        name: p.name,
        href: `/organizations/${currentOrgId}/projects/${p.id}`,
      })) || [];

  // Derive context labels
  const isDocs = pathname?.includes("/docs");
  const isOrgsList = pathname === "/organizations";
  const orgLabel = activeOrg?.name || (currentOrgId ? "Organization" : "Organizations");
  const projectLabel = activeProject?.name || (currentProjectId ? "Project" : "Projects");

  return (
    <>
      <header className="fixed top-0 left-0 w-full h-[90px] bg-[#0a0a0c]/80 backdrop-blur-3xl border-b border-white/10 z-[999] px-12 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="h-full flex items-center justify-between w-full">
          {/* Left: Brand & Context Switchers */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-4 group mr-8">
              <div className="relative w-14 h-14 select-none group-hover:scale-110 transition-transform duration-300 flex items-center justify-center">
                <PluvianLogoMark className="h-full w-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
              </div>
              <span className="text-3xl font-black text-white uppercase tracking-tighter group-hover:text-emerald-400 transition-colors">
                PLUVIANAI
              </span>
            </Link>

            {/* Hierarchical Switchers */}
            <div className="flex items-center gap-2">
              <div className="w-[1.5px] h-6 bg-white/10 mx-2" />

              {isDocs ? (
                <span className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] px-3">
                  Documentation
                </span>
              ) : isOrgsList ? (
                <span className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] px-3">
                  Organizations
                </span>
              ) : (
                <>
                  <SwitcherDropdown
                    label={orgLabel}
                    items={orgSwitcherItems}
                    activeId={currentOrgId as string}
                    badge={activeOrg?.plan?.toUpperCase()}
                    icon={Building2}
                    footerItems={[
                      { label: "All Organizations", href: "/organizations", icon: LayoutGrid },
                      { label: "New Organization", href: "/organizations/new", icon: Plus },
                    ]}
                  />

                  {currentProjectId && (
                    <>
                      <div className="w-[1.5px] h-6 bg-white/10 mx-2" />
                      <SwitcherDropdown
                        label={projectLabel}
                        items={projectSwitcherItems}
                        activeId={currentProjectId as string}
                        icon={LayoutGrid}
                        footerItems={[
                          {
                            label: "All Projects",
                            href: `/organizations/${currentOrgId}/projects`,
                            icon: LayoutGrid,
                          },
                          ...(canCreateProjects
                            ? [
                                {
                                  label: "New Project",
                                  href: `/organizations/${currentOrgId}/projects/new`,
                                  icon: Plus,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Middle: Integrated Navigation */}
          {nav && <div className="flex-1 flex justify-center px-8">{nav}</div>}

          {/* Right: Actions */}
          <div className="flex items-center gap-10">
            <button
              onClick={() => setIsFeedbackOpen(true)}
              className="text-sm font-black text-slate-400 hover:text-white transition-colors uppercase tracking-[0.2em]"
            >
              Feedback
            </button>

            <div className="flex items-center gap-8">
              <button
                onClick={() => router.push("/docs")}
                className="text-sm font-black text-slate-400 hover:text-white transition-colors uppercase tracking-[0.2em]"
              >
                Docs
              </button>

              <div className="w-[1px] h-6 bg-white/10 mx-2" />

              {/* Glowing Emerald Profile Chassis */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-4 group"
                >
                  <div className="w-13 h-13 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-center text-emerald-500 transition-all group-hover:bg-emerald-500/10 group-hover:border-emerald-500/40 group-hover:shadow-[0_0_25px_rgba(16,185,129,0.25)]">
                    <User className="w-7 h-7" />
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-600 group-hover:text-white transition-all duration-300 ${isProfileOpen ? "rotate-180 text-emerald-400" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isProfileOpen && (
                    <>
                      {/* Backdrop for closing */}
                      <div
                        className="fixed inset-0 z-[-1]"
                        onClick={() => setIsProfileOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        className="absolute top-[80px] right-0 w-80 bg-[#0a0a0c]/90 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden z-[200]"
                      >
                        {/* Animated Background Pattern */}
                        <div className="absolute inset-0 bg-flowing-lines opacity-[0.4] pointer-events-none" />

                        <div className="relative z-10 p-2">
                          {/* User Header */}
                          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1">
                              Authenticated Personnel
                            </p>
                            <h4 className="text-lg font-black text-white truncate">
                              {userName || "Researcher"}
                            </h4>
                            <p className="text-xs text-slate-500 font-bold truncate">
                              {userEmail || "clinical-identity@pluvian.ai"}
                            </p>
                          </div>

                          <div className="p-2 space-y-1">
                            <Link
                              href="/settings/profile"
                              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group/item border border-transparent hover:border-white/5"
                            >
                              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 group-hover/item:text-emerald-400 transition-colors">
                                <Settings className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-black text-white uppercase tracking-wider">
                                  Set Profile
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                  Personal Identity
                                </p>
                              </div>
                            </Link>

                            <Link
                              href="/settings/usage"
                              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group/item border border-transparent hover:border-white/5"
                            >
                              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 group-hover/item:text-emerald-400 transition-colors">
                                <BarChart3 className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-black text-white uppercase tracking-wider">
                                  Usage
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                  Account-wide limits
                                </p>
                              </div>
                            </Link>

                            <Link
                              href="/settings/billing"
                              className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group/item border border-transparent hover:border-white/5"
                            >
                              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 group-hover/item:text-emerald-400 transition-colors">
                                <CreditCard className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-black text-white uppercase tracking-wider">
                                  Billing
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                  Plan & invoices
                                </p>
                              </div>
                            </Link>

                            <button
                              onClick={async () => {
                                if (onLogout) {
                                  onLogout();
                                  return;
                                }

                                await authAPI.logout().catch(() => undefined);
                                window.location.href = "/login";
                              }}
                              className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-red-500/5 transition-all group/item border border-transparent hover:border-red-500/10"
                            >
                              <div className="w-10 h-10 rounded-xl bg-red-500/5 flex items-center justify-center text-red-400 group-hover/item:text-red-500 transition-colors">
                                <LogOut className="w-5 h-5" />
                              </div>
                              <div className="text-left flex-1">
                                <p className="text-sm font-black text-white group-hover/item:text-red-400 uppercase tracking-wider">
                                  Terminate
                                </p>
                                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-tight">
                                  End Session
                                </p>
                              </div>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </header>

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </>
  );
};

export default TopHeader;
