"use client";

import { useRouter } from "next/navigation";
import type { PlanLimitError } from "@/lib/planErrors";
import clsx from "clsx";

interface PlanLimitBannerProps extends PlanLimitError {
  context?: "organization" | "project" | "team" | "snapshots" | "replay" | "generic";
  className?: string;
}

export function PlanLimitBanner({
  code,
  message,
  planType,
  current,
  limit,
  upgradePath,
  context = "generic",
  className,
}: PlanLimitBannerProps) {
  const router = useRouter();
  const planLabel = (planType ?? "free").toUpperCase();

  let title = "";
  let body = message || "";

  const counts =
    typeof current === "number" && typeof limit === "number"
      ? ` (${current}/${limit})`
      : "";

  switch (code) {
    case "ORG_LIMIT_REACHED":
      title = "Organization limit reached";
      body =
        body ||
        `You have reached the organization limit for your ${planLabel} plan${counts}. Upgrade your plan to create additional organizations.`;
      break;
    case "PROJECT_LIMIT_REACHED":
      title = "Project limit reached";
      body =
        body ||
        `You have reached the project limit for your ${planLabel} plan${counts}. Upgrade your plan to create additional projects.`;
      break;
    case "TEAM_MEMBER_LIMIT_REACHED":
      title = "Team member limit reached";
      body =
        body ||
        "You have reached the team member limit for this project on your current plan. Upgrade your plan to add more collaborators.";
      break;
    case "SNAPSHOT_PLAN_LIMIT_REACHED":
      title = "Snapshot limit reached";
      body =
        body ||
        "New logs are not being recorded because you have reached the monthly snapshot limit for your current plan. Upgrade your plan to keep logging new runs.";
      break;
    case "LIMIT_PLATFORM_REPLAY_CREDITS":
      title = "Hosted replay credits exhausted";
      body =
        body ||
        "You have used all hosted replay credits for this billing period. Use your own provider key or upgrade your plan for more hosted runs.";
      break;
    default:
      title = "Plan limit reached";
      body =
        body ||
        "This action is not available on your current plan. Upgrade your plan to continue.";
      break;
  }

  const target = upgradePath && upgradePath.startsWith("/") ? upgradePath : "/organizations";

  return (
    <div
      className={clsx(
        "rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-100 space-y-2",
        className
      )}
    >
      <div className="font-black uppercase tracking-[0.18em] text-amber-300 text-[10px] flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]" />
        <span>{title}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-amber-100/90">{body}</p>
      <div className="pt-1">
        <button
          type="button"
          onClick={() => router.push(target)}
          className="inline-flex items-center px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 transition-colors"
        >
          View plans
        </button>
      </div>
    </div>
  );
}

