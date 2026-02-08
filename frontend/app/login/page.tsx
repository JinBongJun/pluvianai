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
import { Beaker, Shield, Lock, Mail, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';

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
        }
    }, [searchParams]);

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
                    setError('You must accept the liability agreement to register');
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
                errorMessage = 'Cannot connect to server. Please check if the backend is running.';
            } else {
                errorMessage = err.message || 'An unexpected error occurred';
            }

            setError(errorMessage);
        } finally {
            stop();
        }
    };

    const { submitting, handleSubmit: onSubmit } = useFormSubmit({ onSubmit: handleSubmit });

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0c] py-12 px-4 sm:px-6 lg:px-8 selection:bg-emerald-500/30">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent opacity-30 blur-3xl pointer-events-none" />

            <div className="max-w-md w-full space-y-8 relative z-10">
                <div className="text-center">
                    <div className="flex justify-center mb-6">
                        <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                            <Beaker className="w-6 h-6 text-emerald-400" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
                        {isLogin ? 'Enter the Lab' : 'Create Lab Access'}
                    </h2>
                    <p className="text-sm text-slate-500 font-medium">
                        {isLogin ? 'Sign in to Synpira Atomic Lab' : 'Register your clinical credentials'}
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={onSubmit}>
                    {error && (
                        <div className="bg-red-500/5 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm font-medium animate-fade-in">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        {!isLogin && (
                            <div className="space-y-1">
                                <label htmlFor="full-name" className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                                    Full Name
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                        <User className="h-4 w-4" />
                                    </div>
                                    <input
                                        id="full-name"
                                        name="fullName"
                                        type="text"
                                        required={!isLogin}
                                        className="block w-full pl-10 pr-3 py-2.5 bg-slate-900/50 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                                        placeholder="Dr. John Doe"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <label htmlFor="email-address" className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                                Professional Email
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                    <Mail className="h-4 w-4" />
                                </div>
                                <input
                                    id="email-address"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="block w-full pl-10 pr-3 py-2.5 bg-slate-900/50 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="password" className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                                Access Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                    <Lock className="h-4 w-4" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    className="block w-full pl-10 pr-12 py-2.5 bg-slate-900/50 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-emerald-400 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {!isLogin && (
                        <div className="space-y-4 pt-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                <span>Password Strength</span>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5].map((lvl) => (
                                        <div
                                            key={lvl}
                                            className={`h-1 w-4 rounded-full transition-colors ${lvl <= pwdStrength ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-800'}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Liability Agreement */}
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-4">
                                <div className="flex items-start gap-4">
                                    <input
                                        id="liability-agreement"
                                        type="checkbox"
                                        checked={liabilityAgreementAccepted}
                                        onChange={(e) => setLiabilityAgreementAccepted(e.target.checked)}
                                        required
                                        className="mt-1 h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-slate-700 rounded bg-slate-900"
                                    />
                                    <label htmlFor="liability-agreement" className="text-xs text-slate-400 cursor-pointer leading-relaxed">
                                        <span className="font-bold text-emerald-400 uppercase tracking-widest block mb-1">Atomic Security Protocol</span>
                                        I understand that AI outputs are non-deterministic. Synpira is a validation lab, and final deployment responsibility remains with the engineer.
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <Button
                            type="submit"
                            disabled={isLoading || submitting || (!isLogin && !liabilityAgreementAccepted)}
                            className="w-full flex justify-center py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold rounded-xl shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] disabled:opacity-50 transition-all group"
                        >
                            {isLoading || submitting ? 'Authenticating...' : isLogin ? 'Enter Laboratory' : 'Initialize Account'}
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </div>

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setError('');
                            }}
                            className="text-[13px] font-medium text-slate-500 hover:text-emerald-400 transition-colors"
                        >
                            {isLogin ? "Don't have professional access? Register" : 'Already verified? Sign in'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="fixed bottom-8 text-[11px] font-bold text-slate-700 uppercase tracking-widest">
                © 2026 Synpira Inc. Verified Session.
            </div>
        </div>
    );
}



