"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction } from "@/actions/auth-actions";
import { authAPI } from "@/lib/api";
import { getAuthErrorMessage } from "@/lib/auth-messages";
import posthog from "posthog-js";
import { passwordStrength } from "@/lib/validation";
import { Lock, Mail, User, Eye, EyeOff, ArrowLeft, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useLoading } from "@/hooks/useLoading";

// Submit button component (uses useFormStatus)
function SubmitButton({
  isLogin,
  liabilityAccepted,
  isLoadingOverride,
}: {
  isLogin: boolean;
  liabilityAccepted: boolean;
  isLoadingOverride?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || isLoadingOverride || (!isLogin && !liabilityAccepted);
  const isSubmitting = pending || isLoadingOverride;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="w-full h-14 flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest rounded-2xl shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)] hover:shadow-[0_0_40px_-5px_rgba(16,185,129,0.6)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
    >
      <span className="text-base">
        {isSubmitting
          ? isLogin
            ? "Verifying..."
            : "Initializing..."
          : isLogin
            ? "Commence Session"
            : "Port Protocol"}
      </span>
      {!isSubmitting && <ArrowRight className="w-5 h-5 stroke-[2.5px]" />}
    </button>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [liabilityAgreementAccepted, setLiabilityAgreementAccepted] = useState(false);
  const [password, setPassword] = useState("");
  const [reauthMessageShown, setReauthMessageShown] = useState(false);
  const [registeredMessageShown, setRegisteredMessageShown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [clientLoginSubmitting, setClientLoginSubmitting] = useState(false);
  const [clientLoginError, setClientLoginError] = useState<string | null>(null);
  const [postAuthRedirect, setPostAuthRedirect] = useState("/organizations");
  const { isLoading, start } = useLoading({ minDuration: 800 });

  // Server Action (register only; login is client-side)
  const [registerState, registerFormAction] = useFormState(registerAction, null);

  const pwdStrength = passwordStrength(password);

  // Prevent hydration mismatch: run only on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Suppress console noise from browser extensions (password managers, FIDO2, autofill, etc.)
  useEffect(() => {
    const isExtensionError = (message: string) =>
      /Duplicate script ID|fido2-page-script-registration|triggerAutofillScriptInjection|Frame with ID.*was removed|No frame with id|extension port.*back\/forward cache/i.test(
        message
      );

    const onError = (e: ErrorEvent) => {
      if (e.message && isExtensionError(e.message)) {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
    };
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason);
      if (isExtensionError(msg)) {
        e.preventDefault();
        return;
      }
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const reauth = params.get("reauth");
    const sessionExpired = params.get("session_expired");
    const registered = params.get("registered");
    const nextPath = params.get("next");

    if (mode === "signup") {
      setIsLogin(false);
    }

    // Standardized post-auth redirect:
    // - safe internal `next` path if provided
    // - fallback to organizations for all current intents
    if (nextPath && nextPath.startsWith("/")) {
      setPostAuthRedirect(nextPath);
    } else {
      setPostAuthRedirect("/organizations");
    }

    if (reauth === "1" || sessionExpired === "1") {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("reauth");
      newUrl.searchParams.delete("session_expired");
      window.history.replaceState({}, "", newUrl.toString());
      setReauthMessageShown(true);
      setTimeout(() => setReauthMessageShown(false), 5000);
    }

    if (registered === "1") {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("registered");
      window.history.replaceState({}, "", newUrl.toString());
      setRegisteredMessageShown(true);
      setTimeout(() => setRegisteredMessageShown(false), 5000);
    }
  }, [mounted]);

  useEffect(() => {
    if (registerState?.success && registerState.data?.access_token) {
      start();

      // Auto-login success handling
      if (typeof window !== "undefined") {
        localStorage.setItem("access_token", registerState.data.access_token);
        if (registerState.data.refresh_token) {
          localStorage.setItem("refresh_token", registerState.data.refresh_token);
        }
        if (registerState.data.user_info) {
          localStorage.setItem("user_info", JSON.stringify(registerState.data.user_info));
        }
      }

      posthog.capture("user_register", { method: "password" });

      setTimeout(() => {
        window.location.href = postAuthRedirect;
      }, 1000);
    } else if (registerState?.success) {
      // Success but no token (manual login required)
      start();
      posthog.capture("user_register", { method: "password" });
      setTimeout(() => {
        router.push("/login?registered=1");
      }, 800);
    }
  }, [registerState, start, router, postAuthRedirect]);

  const registerError =
    registerState?.errors?._form?.[0] ||
    (registerState?.errors && Object.values(registerState.errors)[0]?.[0]);
  const errorMessage = isLogin ? clientLoginError : registerError;

  const handleClientLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientLoginError(null);
    setClientLoginSubmitting(true);
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value;
    if (!email || !password) {
      setClientLoginError("Please enter email and password.");
      setClientLoginSubmitting(false);
      return;
    }
    try {
      await authAPI.login(email, password);
      posthog.capture("user_login", { method: "password" });
      start();
      setTimeout(() => {
        window.location.href = postAuthRedirect;
      }, 400);
    } catch (err: any) {
      setClientLoginError(getAuthErrorMessage(err, "login"));
      setClientLoginSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#030303] selection:bg-emerald-500/30 font-sans relative overflow-hidden">
      {/* Global Antigravity Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#030303]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-50" />

        {/* 1. Global Diagonal Curtain Lights */}
        <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[500px] bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent -rotate-[35deg] blur-[100px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[20%] left-[-20%] w-[150%] h-[600px] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent -rotate-[35deg] blur-[120px] pointer-events-none mix-blend-screen" />

        {/* 2. Geometric Light Beams */}
        <div className="absolute top-1/2 -left-[20%] w-[40%] h-[120%] -translate-y-1/2 rounded-[100%] pointer-events-none opacity-40 border-r-[2px] border-cyan-400/30 bg-gradient-to-l from-cyan-500/20 via-transparent to-transparent shadow-[inset_-20px_0_100px_rgba(34,211,238,0.2)] mix-blend-screen" />
        <div className="absolute top-1/2 -right-[20%] w-[40%] h-[120%] -translate-y-1/2 rounded-[100%] pointer-events-none opacity-30 border-l-[2px] border-emerald-400/30 bg-gradient-to-r from-emerald-500/20 via-transparent to-transparent shadow-[inset_20px_0_100px_rgba(16,185,129,0.2)] mix-blend-screen" />

        {/* 3. High-Density Floating Particles */}
        <div className="absolute top-[10%] left-[30%] w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
        <div className="absolute top-[40%] right-[15%] w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-bounce duration-[3000ms]" />
        <div className="absolute bottom-[10%] right-[30%] w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
      </div>

      {/* Back Button */}
      <Link
        href="/"
        className="fixed top-8 left-8 z-50 flex items-center gap-2 text-slate-400 hover:text-white font-black text-[10px] uppercase tracking-[0.3em] transition-all group bg-black/40 backdrop-blur-xl px-5 py-2.5 rounded-full border border-white/10 hover:border-emerald-500/30 shadow-2xl"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1.5 transition-transform stroke-[3px]" />
        Back to Home
      </Link>

      {/* Left Section: Visual & Marketing */}
      <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden items-center justify-center border-r border-white/5">
        <div className="absolute inset-0 bg-black">
          <Image
            src="/images/agentic-lab.png"
            alt="Pluvian AI Laboratory"
            fill
            priority
            sizes="50vw"
            className="object-cover opacity-60 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/20 to-black" />
        </div>

        <div className="relative z-10 p-12 max-w-xl bg-black/20 backdrop-blur-3xl rounded-[40px] m-10 border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Rim Highlight */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100" />

          <div className="relative z-10">
            {/* Logo */}
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-10 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              <Plus className="w-3.5 h-3.5 stroke-[3px]" />
              PluvianAI Protocol
            </div>

            <h1 className="text-5xl md:text-6xl font-black text-white leading-none tracking-tighter uppercase mb-6 drop-shadow-2xl">
              Secure your <br />
              <span className="text-emerald-500">Agentic</span> future.
            </h1>
            <p className="text-lg text-slate-400 font-medium leading-relaxed max-w-md">
              Validate and ship AI agents with confidence. <br />
              <span className="text-slate-200">Safety and speed, together.</span>
            </p>
          </div>
        </div>
      </div>

      {/* Right Section: Auth Form */}
      <div className="w-full lg:w-[50%] flex flex-col items-center justify-center p-8 sm:p-12 relative z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />

        {!mounted ? (
          <div className="w-full max-w-[440px] min-h-[400px]" aria-hidden="true" />
        ) : (
          <div className="w-full max-w-[440px] space-y-10 relative z-10">
            <div className="text-center">
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white uppercase mb-3 leading-none">
                {isLogin ? "Verify Credentials" : "Initialize Account"}
              </h2>
              <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.4em]">
                {isLogin ? "IDENTITY VERIFICATION REQUIRED" : "ACCESS PROTOCOL INITIATION"}
              </p>
            </div>

            <div className="bg-[#1a1a1e]/90 border border-white/[0.15] p-10 rounded-[40px] backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] relative overflow-hidden group">
              {/* Top Rim Highlight */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100 z-10" />
              <div className="absolute top-[1px] inset-x-10 h-16 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none z-10" />

              <form
                className="space-y-6 relative z-10"
                action={isLogin ? undefined : registerFormAction}
                onSubmit={isLogin ? handleClientLogin : undefined}
              >
                {/* Error Message */}
                {errorMessage && (
                  <div className="bg-red-500/5 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-xs font-bold animate-in fade-in slide-in-from-top-2">
                    {errorMessage}
                  </div>
                )}

                {/* Reauth message: 401/no-token redirect (not "session expired" — e.g. wrong server or token invalid) */}
                {reauthMessageShown && !errorMessage && (
                  <div className="bg-amber-500/5 border border-amber-500/20 text-amber-400 px-4 py-3 rounded-2xl text-xs font-bold">
                    Please log in again.
                    <span className="block mt-1 text-amber-500/80">
                      If you switched between local and Railway, use an account for the current
                      server.
                    </span>
                  </div>
                )}

                {registeredMessageShown && !errorMessage && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-2xl text-xs font-bold">
                    Registration completed. Please sign in to continue.
                  </div>
                )}

                <div className="space-y-5">
                  {/* Full Name (Register only) */}
                  {!isLogin && (
                    <div className="space-y-2">
                      <label
                        htmlFor="full-name"
                        className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1"
                      >
                        Full name
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                          <User className="h-5 w-5 stroke-[1.5px]" />
                        </div>
                        <input
                          id="full-name"
                          name="fullName"
                          type="text"
                          required={!isLogin}
                          className="w-full pl-14 pr-6 py-4 bg-[#0a0a0c]/80 border border-white/20 rounded-2xl text-lg text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 transition-all font-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                          placeholder="Dr. John Doe"
                          onInvalid={e =>
                            (e.target as HTMLInputElement).setCustomValidity(
                              "Please enter your full name"
                            )
                          }
                          onInput={e => (e.target as HTMLInputElement).setCustomValidity("")}
                        />
                      </div>
                    </div>
                  )}

                  {/* Email */}
                  <div className="space-y-2">
                    <label
                      htmlFor="email-address"
                      className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1"
                    >
                      Professional Email
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                        <Mail className="h-5 w-5 stroke-[1.5px]" />
                      </div>
                      <input
                        id="email-address"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="w-full pl-14 pr-6 py-4 bg-[#0a0a0c]/80 border border-white/20 rounded-2xl text-lg text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 transition-all font-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                        placeholder="name@company.com"
                        onInvalid={e =>
                          (e.target as HTMLInputElement).setCustomValidity(
                            "Please enter a valid email address"
                          )
                        }
                        onInput={e => (e.target as HTMLInputElement).setCustomValidity("")}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1"
                    >
                      Security Code
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                        <Lock className="h-5 w-5 stroke-[1.5px]" />
                      </div>
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        className="w-full pl-14 pr-12 py-4 bg-[#0a0a0c]/80 border border-white/20 rounded-2xl text-lg text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 transition-all font-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onInvalid={e =>
                          (e.target as HTMLInputElement).setCustomValidity(
                            "Please enter your password"
                          )
                        }
                        onInput={e => (e.target as HTMLInputElement).setCustomValidity("")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-emerald-400 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password Strength & Liability Agreement (Register only) */}
                {!isLogin && (
                  <div className="space-y-5 pt-2">
                    <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                      <span>Signal Strength</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map(lvl => (
                          <div
                            key={lvl}
                            className={`h-1 w-5 rounded-full transition-all duration-500 ${lvl <= pwdStrength ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "bg-white/5"}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                      <div className="flex items-start gap-4">
                        <input
                          id="liability-agreement"
                          name="liabilityAgreementAccepted"
                          type="checkbox"
                          checked={liabilityAgreementAccepted}
                          onChange={e => setLiabilityAgreementAccepted(e.target.checked)}
                          value="true"
                          required
                          className="mt-1 h-5 w-5 border-white/10 rounded-lg bg-black text-emerald-500 focus:ring-emerald-500/20 transition-all"
                          onInvalid={e =>
                            (e.target as HTMLInputElement).setCustomValidity(
                              "Please accept the terms to proceed"
                            )
                          }
                          onInput={e => (e.target as HTMLInputElement).setCustomValidity("")}
                        />
                        <label
                          htmlFor="liability-agreement"
                          className="text-[11px] text-slate-400 cursor-pointer leading-relaxed font-bold"
                        >
                          <span className="font-black text-emerald-400 uppercase tracking-widest block mb-1 underline decoration-emerald-500/30">
                            Terms accepted
                          </span>
                          I understand that AI outputs are non-deterministic and I use PluvianAI at
                          my own responsibility.
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-2">
                  <SubmitButton
                    isLogin={isLogin}
                    liabilityAccepted={liabilityAgreementAccepted}
                    isLoadingOverride={isLoading || clientLoginSubmitting}
                  />
                </div>

                {/* Toggle Login/Register */}
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setPassword("");
                      setLiabilityAgreementAccepted(false);
                    }}
                    className="text-xs font-black text-slate-500 hover:text-emerald-400 transition-colors uppercase tracking-[0.2em]"
                  >
                    {isLogin ? "Create credentials" : "Return to sign in"}
                  </button>
                </div>
              </form>
            </div>

            <div className="text-center lg:text-left">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em]">
                © 2026 PluvianAI • Ver. 2.9.1
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
