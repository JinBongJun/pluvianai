"use client";

import React from "react";
import TopHeader from "./TopHeader";
import { LaboratoryNavbar } from "./LaboratoryNavbar";
import { LaboratoryRefreshButton } from "./LaboratoryRefreshButton";
import { AccountUsageStrip } from "./AccountUsageStrip";
import { TelemetryHUD, type TelemetryStat } from "./TelemetryHUD";
import clsx from "clsx";
import type { OrganizationProject, OrganizationSummary } from "@/lib/api/types";

interface CanvasPageLayoutProps {
  children: React.ReactNode;
  orgId?: string;
  projectId?: string | number;
  projectName?: string;
  orgName?: string;
  organizations?: OrganizationSummary[];
  projects?: OrganizationProject[];
  topRailMeta?: React.ReactNode;
  activeTab?: string;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  showTelemetry?: boolean;
  telemetryStats?: TelemetryStat[];
  mode?: "PULSE" | "LAB";
  status?: "LIVE" | "SANDBOX" | "REPLAY";
  onAction?: (actionId: string) => void;
  customActions?: { id: string; label: string; icon: any }[];
  navigationVariant?: "top" | "side";
}

const CanvasPageLayout: React.FC<CanvasPageLayoutProps> = ({
  children,
  orgId,
  projectId,
  organizations: providedOrganizations,
  projects: providedProjects,
  topRailMeta,
  leftPanel,
  rightPanel,
  showTelemetry = true,
  telemetryStats,
  mode = "PULSE",
  status = "LIVE",
  onAction = () => {},
  customActions,
  navigationVariant = "top",
}) => {
  // Ensure projectId is consistently handled for the navbar
  const effectiveProjectId = projectId ? Number(projectId) : undefined;
  const hasValidProject = orgId && effectiveProjectId !== undefined && !isNaN(effectiveProjectId);

  return (
    <div className="h-screen w-screen bg-[#0a0a0c] overflow-hidden flex flex-col font-sans text-slate-200">
      {/* Global Top Header - Fixed at 90px */}
      <TopHeader
        organizations={providedOrganizations}
        projects={providedProjects}
        nav={
          navigationVariant === "top" &&
          hasValidProject && <LaboratoryNavbar orgId={orgId!} projectId={effectiveProjectId!} />
        }
      />

      {/* Global Telemetry HUD - Positioned right below TopHeader */}
      {showTelemetry && (
        <div className="fixed top-[90px] left-0 right-0 z-[1000]">
          <TelemetryHUD stats={telemetryStats} customActions={customActions} onAction={onAction} />
        </div>
      )}

      {/* Main Layout Area - Starts after 90px header + Telemetry HUD height (~50px) if visible */}
      <div
        className={clsx(
          "flex-1 flex flex-col relative overflow-hidden transition-all duration-300 p-[2px]", // 2px Frame padding
          showTelemetry ? "pt-[140px]" : "pt-[90px]"
        )}
      >
        {/* Main Content Area - Scrollable Workspace (map); Live View / Release Gate float on the map */}
        <main className="flex-1 flex flex-col relative z-0 overflow-y-auto custom-scrollbar bg-[#0d0d12] rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-l border-r border-white/5">
          {navigationVariant === "side" && hasValidProject && (
            <>
              <div className="absolute left-6 top-6 z-[100] flex flex-wrap items-center gap-3">
                <LaboratoryNavbar orgId={orgId!} projectId={effectiveProjectId!} variant="side" />
                <AccountUsageStrip />
                {topRailMeta}
              </div>
              <LaboratoryRefreshButton projectId={effectiveProjectId!} />
            </>
          )}
          {children}
        </main>

        {/* Left side panel (e.g. Live View detail) */}
        {leftPanel && (
          <div className="absolute top-0 left-0 h-full z-[3000] shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
            {leftPanel}
          </div>
        )}

        {/* Right Diagnostics Panel (The Hospital Wing) */}
        {rightPanel && (
          <div className="absolute top-0 right-0 h-full z-[3000] shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
            {rightPanel}
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasPageLayout;
