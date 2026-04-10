"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { authAPI } from "@/lib/api";

type VerifyState = "loading" | "success" | "error";

function VerifyEmailPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const run = async () => {
      if (!token.trim()) {
        setState("error");
        setMessage("Verification token is missing.");
        return;
      }
      try {
        const result = await authAPI.verifyEmail(token);
        if (result?.purpose === "signup") {
          setState("loading");
          setMessage("Email verified. Preparing your workspace...");
          try {
            const workspace = await authAPI.getDefaultWorkspace();
            if (workspace?.path?.startsWith("/")) {
              router.replace(workspace.path);
              return;
            }
          } catch {
            router.replace("/organizations");
            return;
          }
          router.replace("/organizations");
          return;
        }

        setState("success");
        setMessage("Your email has been verified. You can sign in now.");
      } catch (err: any) {
        setState("error");
        setMessage(
          err?.response?.data?.detail ||
            err?.response?.data?.error?.message ||
            "This verification link is invalid or expired."
        );
      }
    };

    void run();
  }, [router, token]);

  return (
    <main className="min-h-screen bg-[#030303] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-[#111115]/90 p-8 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
          Email Verification
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">
          {state === "loading"
            ? "Checking link"
            : state === "success"
              ? "Verified"
              : "Verification failed"}
        </h1>
        <p className="mt-4 text-sm text-slate-300">{message}</p>
        <div className="mt-8">
          <Link
            href={state === "success" ? "/login?verified=1" : "/login"}
            className="inline-flex rounded-full bg-emerald-500 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black"
          >
            Go to login
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}
