"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TermsPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#030303] text-slate-200">
      <div className="mx-auto w-full max-w-4xl px-6 pb-20 pt-20 md:px-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">Terms of Service</h1>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Last updated: March 2026
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
            <h2 className="text-xl font-bold text-white">1. Service Scope</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              PluvianAI provides tooling for agent observability, replay validation, and release
              gating. You are responsible for your own model prompts, production behavior, and
              customer-facing outputs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">2. Account & Access</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Keep your credentials secure and assign roles carefully. You are responsible for
              actions taken by users invited to your organization workspace.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">3. Acceptable Use</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              You must not use the service to process unlawful content, abuse third-party systems,
              or attempt to disrupt service integrity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">4. Data Lifecycle</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Data retention and deletion follow the policy published on the{" "}
              <Link href="/security" className="text-emerald-400 hover:text-emerald-300">
                Security & Data Retention
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">5. Liability</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              The service is provided on an as-is basis. To the maximum extent allowed by law,
              PluvianAI is not liable for indirect or consequential damages.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
