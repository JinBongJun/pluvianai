"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Phase 5 — customer-facing one-pager: what Live View / ingest stores vs omits.
 * Technical appendix: docs/live-view-trust-data-collection.md (repo).
 */
export default function TrustDataCollectionPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#030303] text-slate-200">
      <div className="mx-auto w-full max-w-4xl px-6 pb-20 pt-20 md:px-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">Live View &amp; ingest data</h1>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              What we store, what we don&apos;t, and what you control
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
            <h2 className="text-xl font-bold text-white">What gets stored</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Only what your application sends through the{" "}
              <span className="text-slate-200">ingest API</span> or{" "}
              <span className="text-slate-200">SDK</span> (for example{" "}
              <code className="text-emerald-400/90">request_data</code>,{" "}
              <code className="text-emerald-400/90">response_data</code>, optional{" "}
              <code className="text-emerald-400/90">tool_events</code>). If a field was never sent, it
              will not appear in the UI — an empty area means “not collected”, not a server bug.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">What we don&apos;t assume</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              We do not infer end-user prompts, tool outputs, or RAG context unless your app included
              them in the payload you chose to send. Secret-like patterns may be masked on the server
              before persistence (see{" "}
              <Link href="/security" className="text-emerald-400 hover:text-emerald-300">
                Security &amp; Data Retention
              </Link>
              ).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">What you can turn off (SDK)</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Python and Node SDKs support privacy flags and byte limits (for example omitting message
              bodies or truncating large JSON). When enabled, the product shows clear{" "}
              <span className="text-amber-200/90">Privacy</span> /{" "}
              <span className="text-amber-200/90">Truncated</span> hints in Live View. See your SDK README
              &quot;Security / privacy&quot; section for env names such as{" "}
              <code className="text-slate-300">PLUVIANAI_LOG_USER_CONTENT</code>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Release Gate vs Live View</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Release Gate surfaces <span className="text-slate-200">tool evidence</span> from the replay
              pipeline; Live View snapshot detail uses stored snapshots and the same tool timeline
              components where applicable. Provenance labels (recorded vs simulated) explain what was
              grounded from your traces.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">Related</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-400">
              <li>
                <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300">
                  Privacy Policy
                </Link>{" "}
                — legal framing
              </li>
              <li>
                <Link href="/security" className="text-emerald-400 hover:text-emerald-300">
                  Security &amp; Data Retention
                </Link>
              </li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Developers: full field matrix and JSON examples live in the repository under{" "}
              <code className="text-slate-400">docs/live-view-trust-data-collection.md</code> and{" "}
              <code className="text-slate-400">docs/live-view-ingest-field-matrix.md</code>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
