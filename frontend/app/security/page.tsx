"use client";

import { useRouter } from "next/navigation";

export default function SecurityPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#030303] text-slate-200">
      <div className="mx-auto w-full max-w-4xl px-6 pb-20 pt-20 md:px-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">Security & Data Retention</h1>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Operational baseline for beta customers
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-10">
          <section>
            <h2 className="text-xl font-bold text-white">Current Security Baseline</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
              <li>- Role-based access controls gate organization, project, and team-management actions.</li>
              <li>- Login flow includes password hashing, brute-force protection, and login-attempt tracking.</li>
              <li>- Unexpected server errors are returned as generic `500` responses instead of raw exception text.</li>
              <li>- Product analytics and server-side event payloads are trimmed/redacted for common secret fields.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Data Retention</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
              <li>- Free plan baseline: snapshots/logs retained for 30 days.</li>
              <li>- Organization/project delete requests are soft-deleted first.</li>
              <li>- Soft-deleted entities are hard-deleted after a 30-day grace window.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Secret Redaction</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Common secret-like keys and token-shaped values are masked before persistence to
              reduce accidental exposure risk in stored payloads.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Access Control</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Organization and project actions are protected by role-based permissions. Users without
              sufficient roles receive explicit action-level denial messages.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Operational Metadata</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              We retain security and operations metadata such as user IDs, IP addresses, user-agent
              strings, and audit records needed for login protection, abuse review, and product
              operations. This metadata is not treated as marketing content and may appear in internal
              operational systems even when customer payload content is redacted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Infra & Monitoring</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Service health is monitored with operational alerting and periodic cleanup jobs.
              Current beta baseline uses Railway-hosted runtime infrastructure and PostHog analytics
              telemetry with reduced property collection for common sensitive fields.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Region Baseline</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Current deployment baseline is US-based infrastructure. Region policy will be updated
              if dedicated regional hosting is introduced.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Current Limitations</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
              <li>- This is an MVP/beta baseline, not a SOC 2, ISO 27001, or enterprise compliance claim.</li>
              <li>- SSO, MFA enforcement, customer-managed keys, and formal pentest attestations are not yet shipped.</li>
              <li>- US-only deployment is the current default; regional residency guarantees are not yet offered.</li>
              <li>- If you need stricter contractual/security controls, treat them as roadmap items unless explicitly agreed in writing.</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
