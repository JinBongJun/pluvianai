"use client";

import clsx from "clsx";
import {
  Activity,
  Fingerprint,
  Lock,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import {
  getAccessSourceLabel,
  getEntitlementScopeLabel,
  getProjectRoleLabel,
  type AccessSource,
  type EntitlementScope,
  type ProjectRole,
} from "@/lib/projectAccess";

const ROLE_STYLES: Record<
  ProjectRole,
  { icon: LucideIcon; className: string; iconClassName: string }
> = {
  owner: {
    icon: Lock,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    iconClassName: "text-emerald-400",
  },
  admin: {
    icon: Shield,
    className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
    iconClassName: "text-indigo-400",
  },
  member: {
    icon: Fingerprint,
    className: "border-slate-500/30 bg-slate-500/10 text-slate-200",
    iconClassName: "text-slate-300",
  },
  viewer: {
    icon: Activity,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    iconClassName: "text-amber-400",
  },
};

export function ProjectRoleBadge({
  role,
  emptyLabel = "No project role",
  className,
}: {
  role?: string | null;
  emptyLabel?: string;
  className?: string;
}) {
  if (!role) {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300",
          className
        )}
      >
        <UserRound className="h-3 w-3 text-slate-400" />
        {emptyLabel}
      </span>
    );
  }

  const normalized = role.toLowerCase() as ProjectRole;
  const style = ROLE_STYLES[normalized];
  if (!style) {
    return (
      <span
        className={clsx(
          "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300",
          className
        )}
      >
        {role}
      </span>
    );
  }

  const Icon = style.icon;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
        style.className,
        className
      )}
    >
      <Icon className={clsx("h-3 w-3", style.iconClassName)} />
      {getProjectRoleLabel(role)}
    </span>
  );
}

export function AccessSourceBadge({
  source,
  className,
}: {
  source?: string | null;
  className?: string;
}) {
  if (!source) return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200",
        className
      )}
    >
      {getAccessSourceLabel(source as AccessSource)}
    </span>
  );
}

export function EntitlementScopeBadge({
  scope,
  className,
}: {
  scope?: string | null;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200",
        className
      )}
    >
      {getEntitlementScopeLabel(scope as EntitlementScope)}
    </span>
  );
}
