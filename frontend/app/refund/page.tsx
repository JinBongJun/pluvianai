"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RefundPolicyPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#030303] text-slate-200">
      <div className="mx-auto w-full max-w-4xl px-6 pb-20 pt-20 md:px-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">Refund & Cancellation Policy</h1>
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
            <h2 className="text-xl font-bold text-white">1. Subscription Billing</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Paid plans are billed in advance on a recurring monthly cycle and renew automatically
              until canceled.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">2. Cancellation</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              You can cancel anytime from account billing settings. Cancellation applies to the next
              billing cycle, and your paid access remains active through the end of the current
              paid term.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">3. Refunds</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Charges are generally non-refundable except where required by applicable law, or where
              a duplicate/incorrect charge is verified by our team.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">4. Contact</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              For billing-related questions or refund requests, contact us via{" "}
              <Link href="/settings/profile" className="text-emerald-400 hover:text-emerald-300">
                account settings support
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
