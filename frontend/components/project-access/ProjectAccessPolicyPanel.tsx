"use client";

import Link from "next/link";

export function ProjectAccessPolicyPanel({
  accountBillingHref = "/settings/billing",
}: {
  accountBillingHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
      <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
        Shared Access Policy
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
            1. Why projects appear
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Organization membership can make a project visible in the project list even before you
            have project-level access.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
            2. What actually unlocks use
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Your project role controls whether you can open and use Live View, Release Gate, and
            other project actions.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
            3. Which plan limits apply
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Shared projects currently follow each member&apos;s account plan limits. You can review
            your current limits in{" "}
            <Link href={accountBillingHref} className="text-emerald-300 hover:text-emerald-200">
              Billing
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
