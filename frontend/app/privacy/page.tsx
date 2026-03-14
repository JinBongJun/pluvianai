"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#030303] text-slate-200">
      <div className="mx-auto w-full max-w-4xl px-6 pb-20 pt-20 md:px-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">Privacy Policy</h1>
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
            <h2 className="text-xl font-bold text-white">1. What We Collect</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              We collect account metadata, organization/workspace metadata, and trace-related
              snapshots you submit for observability and release validation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">2. Why We Process It</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Data is used to deliver Live View, Release Gate analysis, usage metering, and service
              reliability monitoring.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">3. Secret Handling</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              We apply secret filtering/masking rules before persistence for common API key and
              token patterns.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">4. Retention</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Retention windows and deletion behavior are documented on{" "}
              <Link href="/security" className="text-emerald-400 hover:text-emerald-300">
                Security & Data Retention
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">5. Service Providers</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              We use PostHog for product analytics and Railway-hosted infrastructure services for
              application/runtime operations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">6. Data Location</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Customer data is processed and stored on US-based infrastructure for the current beta
              deployment baseline.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
