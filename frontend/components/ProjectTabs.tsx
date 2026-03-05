import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Eye, Flag } from "lucide-react";

interface ProjectTabsProps {
  projectId: number;
  orgId: string;
  basePath?: string;
  canManage?: boolean;
  worstAlertCounts?: {
    liveView: number;
    testLab: number;
  };
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({
  projectId,
  orgId,
  basePath,
  canManage,
  worstAlertCounts,
}) => {
  const pathname = usePathname();

  // Policy is per-agent: Live View → agent card → POLICY tab (no standalone Policy Hub)
  const coreTabs = [
    { name: "Live View", slug: "live-view", icon: Eye },
    { name: "Release Gate", slug: "release-gate", icon: Flag },
  ];

  const effectiveProjectId = projectId && !isNaN(projectId) ? projectId : 0;

  return (
    <div className="border-b border-white/10 mb-6">
      <nav className="flex gap-1 overflow-x-auto">
        {coreTabs.map(tab => {
          const Icon = tab.icon;
          const href = effectiveProjectId
            ? `/organizations/${orgId}/projects/${effectiveProjectId}/${tab.slug}`
            : "#";
          const isActive =
            !!effectiveProjectId && (pathname === href || pathname?.startsWith(`${href}/`));

          if (!effectiveProjectId) return null;

          return (
            <React.Fragment key={tab.name}>
              <Link
                href={href}
                className={clsx(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </Link>
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
};

export default ProjectTabs;
