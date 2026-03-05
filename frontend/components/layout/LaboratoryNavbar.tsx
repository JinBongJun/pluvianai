"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ShieldCheck, Flag } from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";

interface LaboratoryNavbarProps {
  orgId: string;
  projectId: number;
}

export const LaboratoryNavbar: React.FC<LaboratoryNavbarProps> = ({ orgId, projectId }) => {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Live View",
      href: `/organizations/${orgId}/projects/${projectId}/live-view`,
      icon: Activity,
      color: "violet",
    },
    {
      name: "Release Gate",
      href: `/organizations/${orgId}/projects/${projectId}/release-gate`,
      icon: Flag,
      color: "fuchsia",
    },
  ];

  const effectiveProjectId = projectId && !isNaN(projectId) ? projectId : 0;

  return (
    <nav className="flex items-center gap-1.5 h-full">
      {navItems.map(item => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        // Construct safe href
        const href = effectiveProjectId
          ? `/organizations/${orgId}/projects/${effectiveProjectId}/${item.href.split("/").pop()}`
          : "#";

        const colorMap: Record<
          string,
          { active: string; bg: string; icon: string; border: string }
        > = {
          fuchsia: {
            active: "text-fuchsia-400",
            bg: "bg-fuchsia-500/10",
            icon: "text-fuchsia-500",
            border: "border-fuchsia-500/20",
          },
          violet: {
            active: "text-violet-400",
            bg: "bg-violet-500/10",
            icon: "text-violet-500",
            border: "border-violet-500/20",
          },
          emerald: {
            active: "text-emerald-400",
            bg: "bg-emerald-500/10",
            icon: "text-emerald-500",
            border: "border-emerald-500/20",
          },
          sky: {
            active: "text-sky-400",
            bg: "bg-sky-500/10",
            icon: "text-sky-500",
            border: "border-sky-500/20",
          },
        };

        const theme = colorMap[item.color] || colorMap.emerald;

        if (!effectiveProjectId) return null;

        return (
          <Link
            key={item.name}
            href={href}
            className={clsx(
              "group flex items-center gap-2.5 px-4 py-1.5 rounded-lg transition-all duration-200 border",
              isActive
                ? `${theme.bg} ${theme.active} ${theme.border} shadow-[0_0_15px_rgba(0,0,0,0.2)]`
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
            )}
          >
            <Icon
              className={clsx(
                "w-4 h-4 transition-colors",
                isActive ? theme.active : `${theme.icon} opacity-50`
              )}
            />
            <span
              className={clsx(
                "text-[12px] font-bold tracking-tight",
                isActive ? "opacity-100" : "opacity-70"
              )}
            >
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
