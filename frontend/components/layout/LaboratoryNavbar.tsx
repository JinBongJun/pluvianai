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
  variant?: "top" | "side";
}

export function LaboratoryNavbar({ orgId, projectId, variant = "top" }: LaboratoryNavbarProps) {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Live View",
      href: `/organizations/${orgId}/projects/${projectId}/live-view`,
      icon: Activity,
      color: "emerald",
    },
    {
      label: "Release Gate",
      href: `/organizations/${orgId}/projects/${projectId}/release-gate`,
      icon: Flag,
      color: "fuchsia",
    },
  ];

  // Side variant: match sidebar menu (LiveViewToolbar) — bg, border, shadow, rounded-[20px]
  const sideContainerClass =
    "bg-[#1a1a1e]/95 border border-white/[0.15] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] rounded-[20px] backdrop-blur-3xl transition-all duration-500 hover:border-white/30";

  return (
    <div
      className={clsx(
        "flex items-center transition-all duration-500",
        variant === "top" &&
          "gap-1.5 p-1 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl bg-black/40",
        variant === "side" && clsx("gap-1 p-1.5", sideContainerClass)
      )}
    >
      <nav className="flex items-center gap-1 h-full">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={clsx(
                "relative py-2.5 rounded-xl flex items-center transition-all duration-500 group overflow-hidden",
                variant === "top" ? "px-6 gap-3" : "px-3 gap-2",
                isActive
                  ? "text-white"
                  : "text-zinc-400 hover:text-emerald-400 hover:bg-white/[0.05]"
              )}
            >
              {/* Top Rim Highlight for active tab */}
              {isActive && (
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-80" />
              )}

              <Icon
                className={clsx(
                  "w-5 h-5 transition-all duration-700",
                  isActive
                    ? item.color === "emerald"
                      ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                      : "text-fuchsia-400 drop-shadow-[0_0_8px_rgba(232,121,249,0.8)]"
                    : "group-hover:scale-110 opacity-40"
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />

              <span
                className={clsx(
                  "text-[10px] font-black tracking-[0.2em] uppercase transition-all duration-300",
                  isActive ? "opacity-100" : "opacity-50"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
