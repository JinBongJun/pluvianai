"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authAPI } from "@/lib/api";

export default function VerifyEmailPendingPage() {
  const searchParams = useSearchParams();
  const email = (searchParams.get("email") || "").trim();
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleResend = async () => {
    if (!email) return;
    setIsSending(true);
    setNotice(null);
    try {
      await authAPI.resendVerification(email);
      setNotice("Verification email sent again. Please check your inbox.");
    } catch {
      setNotice("Could not resend the verification email right now.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#030303] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-2xl rounded-[36px] border border-white/10 bg-[#111115]/90 p-8 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
          Check Your Inbox
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Verify your email to open your workspace</h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          We sent a verification link to your email. Once you confirm it, we&apos;ll prepare your
          first workspace and open Live View automatically.
        </p>

        <div className="mt-8 rounded-[28px] border border-white/10 bg-black/20 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
            Verification Email
          </p>
          <p className="mt-3 text-lg font-black text-white break-all">
            {email || "Use the email address you signed up with."}
          </p>
        </div>

        {notice ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm font-bold text-emerald-300">
            {notice}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-4">
          <a
            href="https://mail.google.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full bg-emerald-500 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black"
          >
            Open Gmail
          </a>
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={!email || isSending}
            className="inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Resend Email"}
          </button>
          <Link
            href="/login?mode=signup"
            className="inline-flex rounded-full border border-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-slate-300"
          >
            Use Different Email
          </Link>
        </div>
      </div>
    </main>
  );
}
