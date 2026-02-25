'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authAPI } from '@/lib/api';
import posthog from 'posthog-js';
import { useLoading } from '@/hooks/useLoading';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { getErrorMessage } from '@/lib/errorMessages';
import { validateEmail, validatePassword, passwordStrength } from '@/lib/validation';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';
import { Shield, Lock, Mail, User, Eye, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [liabilityAgreementAccepted, setLiabilityAgreementAccepted] = useState(false);
    const { isLoading, start, stop } = useLoading({ minDuration: 300 });
    const pwdStrength = passwordStrength(password);

    useEffect(() => {
        const mode = searchParams?.get('mode');
        const sessionExpired = searchParams?.get('session_expired');
        if (mode === 'signup') {
            setIsLogin(false);
        }
        if (sessionExpired === '1') {
            setError('Session expired. Please log in again.');
        } else {
            // If already logged in and not an expiry case, redirect to dashboard
            const token = localStorage.getItem('access_token');
            if (token) {
                router.push('/organizations');
            }
        }
    }, [searchParams, router]);

    const handleSubmit = async () => {
        setError('');

        const emailError = validateEmail(email);
        if (emailError) {
            setError(emailError);
            return;
        }
        if (!isLogin) {
            const pwdError = validatePassword(password);
            if (pwdError) {
                setError(pwdError);
                return;
            }
        }

        start();

        try {
            if (isLogin) {
                await authAPI.login(email, password);
                posthog.capture('user_login', { method: 'password' });
                router.push('/organizations');
            } else {
                if (!liabilityAgreementAccepted) {
                    setError('You must accept the clinical protocol to register');
                    return;
                }
                await authAPI.register(email, password, fullName, liabilityAgreementAccepted);
                posthog.capture('user_register', { method: 'password' });
                await authAPI.login(email, password);
                posthog.capture('user_login', { method: 'password' });
                router.push('/organizations');
            }
        } catch (err: any) {
            logger.error('Login error', err);
            let errorMessage = 'An error occurred';

            if (err.response) {
                const detail = err.response.data?.detail;
                if (typeof detail === 'string') {
                    errorMessage = getErrorMessage(detail) || detail;
                } else if (typeof detail === 'object' && detail?.message) {
                    errorMessage = detail.message;
                } else {
                    errorMessage = `Server error: ${err.response.status}`;
                }
            } else if (err.request) {
                errorMessage = 'Cannot connect to clinical server. Please check your connection.';
            } else {
                errorMessage = err.message || 'An unexpected error occurred during validation';
            }

            setError(errorMessage);
        } finally {
            stop();
        }
    };

    const { submitting, handleSubmit: onSubmit } = useFormSubmit({ onSubmit: handleSubmit });

    return (
        <div className="min-h-screen flex bg-[#0a0a0c] selection:bg-emerald-500/30 font-sans relative">

            {/* Split Layout: Left Corner Back Button (Floating) */}
            <Link
                href="/"
                className="fixed top-8 left-8 z-50 flex items-center gap-2 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest transition-all group bg-black/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 hover:border-white/20"
            >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                Back to Home
            </Link>

            {/* Left Section: Visual & Marketing (Hidden on Mobile) */}
            <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center border-r border-white/5">
                <div className="absolute inset-0 bg-black">
                    <img
                        src="/images/Croc-Bird image.png"
                        alt="Pluvian AI Symbiosis"
                        className="w-full h-full object-cover opacity-70 transition-opacity duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black" />
                </div>

                <div className="relative z-10 p-12 max-w-2xl bg-[#0a0a0c]/40 backdrop-blur-md rounded-[40px] m-10 border border-white/10 shadow-2xl">
                    <div className="mb-12">
                        {/* Official Croc-Bird Logo SVG */}
                        <div className="relative w-16 h-16 mb-8">
                            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                                <path
                                    d="M20 50 C 20 20, 80 20, 80 50 L 80 80 L 20 80 Z"
                                    fill="none"
                                    stroke="#06b6d4"
                                    strokeWidth="4"
                                />
                                <circle cx="40" cy="45" r="5" fill="#10b981" />
                                <path d="M60 60 L 90 40" stroke="#10b981" strokeWidth="2" />
                            </svg>
                        </div>
                        <h1 className="text-6xl font-black text-white leading-tight mb-6">
                            Secure your <span className="text-emerald-400">Agentic</span> future.
                        </h1>
                        <p className="text-xl text-slate-300 font-medium leading-relaxed">
                            PluvianAI provides high-resolution clinical validation for modern AI agents. Join the symbiosis of safety and speed.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-8 pt-8 border-t border-white/10">
                        <div>
                            <p className="text-3xl font-black text-white mb-2">13+</p>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Atomic Signals tracked</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Section: Auth Form */}
            <div className="w-full lg:w-[45%] flex flex-col items-center justify-center p-8 sm:p-12 relative overflow-hidden">
                {/* Secondary Atmosphere for Right Side */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

                <div className="w-full max-w-[420px] space-y-10 relative z-10 mt-12 lg:mt-0">
                    <div className="text-center lg:text-left">
                        <h2 className="text-4xl font-black tracking-tight text-white mb-3">
                            {isLogin ? 'Verify Credentials' : 'Initialize Account'}
                        </h2>
                        <p className="text-sm text-slate-500 font-black uppercase tracking-[0.2em]">
                            {isLogin ? 'Enter Laboratory Access code' : 'Register professional lab profile'}
                        </p>
                    </div>

                    <div className="bg-[#0f0f12]/60 backdrop-blur-3xl border border-white/5 p-8 rounded-[32px] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)]">
                        <form className="space-y-6" onSubmit={onSubmit}>
                            {error && (
                                <div className="bg-red-500/5 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-xs font-bold animate-in fade-in slide-in-from-top-2">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-5">
                                {!isLogin && (
                                    <div className="space-y-2">
                                        <label htmlFor="full-name" className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                                            Clinical Identity
                                        </label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                                                <User className="h-4 w-4" />
                                            </div>
                                            <input
                                                id="full-name"
                                                name="fullName"
                                                type="text"
                                                required={!isLogin}
                                                className="block w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-bold"
                                                placeholder="Dr. John Doe"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Please enter your full name')}
                                                onInput={(e) => (e.target as HTMLInputElement).setCustomValidity('')}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label htmlFor="email-address" className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                                        Professional Email
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                                            <Mail className="h-4 w-4" />
                                        </div>
                                        <input
                                            id="email-address"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            className="block w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-bold"
                                            placeholder="name@company.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Please enter a valid email address')}
                                            onInput={(e) => (e.target as HTMLInputElement).setCustomValidity('')}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="password" className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                                        Security Code
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                                            <Lock className="h-4 w-4" />
                                        </div>
                                        <input
                                            id="password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="current-password"
                                            required
                                            className="block w-full pl-12 pr-12 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-bold"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Please enter your password')}
                                            onInput={(e) => (e.target as HTMLInputElement).setCustomValidity('')}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-emerald-400 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {!isLogin && (
                                <div className="space-y-5 pt-2">
                                    <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                                        <span>Signal Strength</span>
                                        <div className="flex gap-1.5">
                                            {[1, 2, 3, 4, 5].map((lvl) => (
                                                <div
                                                    key={lvl}
                                                    className={`h-1 w-5 rounded-full transition-all duration-500 ${lvl <= pwdStrength ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-white/5'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                                        <div className="flex items-start gap-4">
                                            <input
                                                id="liability-agreement"
                                                type="checkbox"
                                                checked={liabilityAgreementAccepted}
                                                onChange={(e) => setLiabilityAgreementAccepted(e.target.checked)}
                                                required
                                                className="mt-1 h-5 w-5 border-white/10 rounded-lg bg-black text-emerald-500 focus:ring-emerald-500/20 transition-all"
                                                onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Please accept the clinical protocol to proceed')}
                                                onInput={(e) => (e.target as HTMLInputElement).setCustomValidity('')}
                                            />
                                            <label htmlFor="liability-agreement" className="text-[11px] text-slate-400 cursor-pointer leading-relaxed font-bold">
                                                <span className="font-black text-emerald-400 uppercase tracking-widest block mb-1 underline decoration-emerald-500/30">Clinical Protocol accepted</span>
                                                I formalize clinical accountability for my agents. I understand that AI results are non-deterministic.
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    disabled={isLoading || submitting || (!isLogin && !liabilityAgreementAccepted)}
                                    className="w-full flex justify-center py-5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black text-base font-black rounded-2xl shadow-[0_10px_30px_-5px_rgba(16,185,129,0.3)] disabled:opacity-50 transition-all group"
                                >
                                    {isLoading || submitting ? 'Authenticating...' : isLogin ? 'Access Clinical Lab' : 'Register Profile'}
                                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1.5 transition-transform" />
                                </Button>
                            </div>

                            <div className="text-center pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsLogin(!isLogin);
                                        setError('');
                                    }}
                                    className="text-sm font-black text-slate-500 hover:text-emerald-400 transition-colors uppercase tracking-widest"
                                >
                                    {isLogin ? "Need credentials? Register" : "Already a clinical user? Sign in"}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="text-center lg:text-left">
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em]">
                            © 2026 PluvianAI Clinical Labs • Ver. 2.9.1
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
