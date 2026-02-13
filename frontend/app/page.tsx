'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
    Bot,
    Zap,
    Shield,
    BarChart3,
    ChevronRight,
    Beaker,
    CheckCircle2,
    AlertTriangle,
    Layers,
    Cpu,
    ArrowRight,
    Terminal,
    Search,
    History,
    Activity
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import SymbioticGuardianVisual from '@/components/landing/SymbioticGuardianVisual';
import PathologySection from '@/components/landing/PathologySection';
import TreatmentSection from '@/components/landing/TreatmentSection';
import AtomicSignalsSection from '@/components/landing/AtomicSignalsSection';
import PricingSection from '@/components/landing/PricingSection';
import InteractiveHoverText from '@/components/ui/InteractiveHoverText';

export default function Home() {
    const router = useRouter();
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            setIsLoggedIn(true);
        }
    }, []);

    return (
        <div className="min-h-screen text-slate-200 selection:bg-emerald-500/30 font-sans">
            {/* 1. Navbar */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl">
                <div className="w-full px-6 md:px-12 lg:px-16 h-[90px] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Logo: Croc & Bird Silhouette (SVG for now, replace with logo.png later) */}
                        <div className="relative w-14 h-14 pointer-events-none select-none hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                            {/* Logo: Croc & Bird Silhouette (SVG for now, replace with logo.png later) */}
                            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                                <path
                                    d="M20 50 C 20 20, 80 20, 80 50 L 80 80 L 20 80 Z"
                                    fill="none"
                                    stroke="#06b6d4"
                                    strokeWidth="4"
                                    className="animate-pulse"
                                />
                                <circle cx="40" cy="45" r="5" fill="#10b981" />
                                <path d="M60 60 L 90 40" stroke="#10b981" strokeWidth="2.5" />
                            </svg>
                        </div>
                        <span className="text-3xl font-black tracking-tighter text-white uppercase transition-colors group-hover:text-emerald-400">PLUVIANAI</span>
                    </div>


                    {/* Right Side Navigation & Actions */}
                    <div className="flex items-center gap-8 lg:gap-10">
                        {/* Desktop Navigation Links */}
                        <div className="hidden lg:flex items-center gap-8 md:gap-10">
                            {/* Platform Dropdown */}
                            <div className="relative group/nav">
                                <button className="flex items-center gap-1.5 text-lg font-medium text-slate-400 hover:text-emerald-400 transition-colors py-8">
                                    Platform
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover/nav:rotate-180 transition-transform duration-300">
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>

                                {/* Dropdown Menu - Aligned to Right */}
                                <div className="absolute top-[80px] right-0 w-64 opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 translate-y-2 group-hover/nav:translate-y-0 z-[60]">
                                    <div className="p-2 rounded-lg bg-[#0a0a0c]/90 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
                                        <div className="grid gap-1">
                                            <a href="#problem" className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item">
                                                <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">Logic Guard</span>
                                                <span className="text-xs text-slate-500">Hallucination Prevention</span>
                                            </a>
                                            <a href="#features" className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item">
                                                <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">Atomic Lab</span>
                                                <span className="text-xs text-slate-500">The Periodic Table of AI Risk</span>
                                            </a>
                                            <a href="#workflow" className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item">
                                                <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">Surgical Workflow</span>
                                                <span className="text-xs text-slate-500">Clinical Integration & Treatment</span>
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <a href="#pricing" className="text-lg font-bold text-slate-400 hover:text-emerald-400 transition-colors">Pricing</a>
                            <a href="/docs" className="text-lg font-bold text-slate-400 hover:text-emerald-400 transition-colors">Docs</a>
                        </div>

                        <div className="h-8 w-[1px] bg-white/10 hidden lg:block" />

                        {isLoggedIn ? (
                            <Link href="/organizations">
                                <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-black px-10 h-12 text-lg rounded-md shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-105 whitespace-nowrap uppercase tracking-widest">
                                    Enter Laboratory
                                </Button>
                            </Link>
                        ) : (
                            <>
                                <div className="hidden md:flex items-center gap-6 text-lg font-bold">
                                    <Link href="/login" className="text-slate-400 hover:text-white transition-colors">Log In</Link>
                                    <Link href="/login?mode=signup" className="text-slate-400 hover:text-white transition-colors">Sign Up</Link>
                                </div>
                                <Link href="/login?intent=validation">
                                    <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-black px-8 h-12 text-lg rounded-md shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-105 whitespace-nowrap uppercase tracking-widest">
                                        Start Validation
                                    </Button>
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </nav>

            {/* 2. Hero Section */}
            <section className="relative min-h-screen flex flex-col items-center justify-center pt-40 pb-20 overflow-hidden bg-[#0a0a0c] z-10 transition-all duration-700">
                {/* Background Video - Absolute to Hero Section */}
                <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover opacity-60 scale-105"
                    >
                        <source src="/new-hero.mp4" type="video/mp4" />
                    </video>
                    {/* Dark Overlay for Text Readability - Optimized for text pop */}
                    <div className="absolute inset-0 bg-black/40" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-[#0a0a0c]/60" />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c]/80 via-transparent to-transparent" />
                </div>

                {/* Ambient Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent pointer-events-none -z-10 blur-3xl" />

                <div className="w-full max-w-[1400px] mx-auto px-6 relative z-10 text-center flex flex-col items-center">

                    {/* Validation Badge - Premium Glassmorphism */}
                    <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-sm font-bold tracking-widest uppercase mb-16 shadow-[0_0_30px_-5px_rgba(16,185,129,0.2)] backdrop-blur-md hover:border-emerald-500/40 transition-colors cursor-default">
                        <div className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </div>
                        Clinical Grade Validation
                    </div>

                    <div className="max-w-6xl mx-auto space-y-10">
                        {/* Headline - Brand Promise First */}
                        <div className="space-y-4">
                            <h1 className="text-6xl md:text-8xl font-[900] tracking-tight text-white leading-[1.1] drop-shadow-2xl">
                                The Symbiotic Guardian <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 animate-gradient-x pb-2">
                                    for AI Agents.
                                </span>
                            </h1>
                            <p className="text-xl md:text-2xl text-white max-w-3xl mx-auto font-semibold leading-relaxed pt-6">
                                Cut hallucination rates & logic errors in half. Instantly.<br />
                                <span className="text-slate-300">We don't build the Agent. We <span className="text-emerald-400 font-bold">cure</span> it.</span>
                            </p>
                        </div>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
                            {isLoggedIn ? (
                                <Link href="/organizations">
                                    <Button className="h-16 px-12 text-2xl font-black rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_50px_-10px_rgba(16,185,129,0.5)] hover:shadow-[0_0_70px_-10px_rgba(16,185,129,0.7)] transition-all hover:scale-[1.02] uppercase tracking-tighter">
                                        Return to Laboratory
                                    </Button>
                                </Link>
                            ) : (
                                <Link href="/login?mode=signup&intent=trial">
                                    <Button className="h-16 px-12 text-2xl font-black rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_50px_-10px_rgba(16,185,129,0.5)] hover:shadow-[0_0_70px_-10px_rgba(16,185,129,0.7)] transition-all hover:scale-[1.02] uppercase tracking-tighter">
                                        Start Clinical Trial
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. Social Proof */}
            <section className="py-16 border-y border-white/5 bg-[#08080a]/80 backdrop-blur-sm relative z-10">
                <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16">
                    <p className="text-center text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600 mb-10">
                        Compatible with all major clinical models
                    </p>
                    <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 opacity-30 grayscale hover:grayscale-0 transition-all duration-700 brightness-200">
                        <span className="text-xl font-bold tracking-tighter">ANTHROPIC</span>
                        <span className="text-xl font-bold tracking-tighter">OPENAI</span>
                        <span className="text-xl font-bold tracking-tighter">MISTRAL</span>
                        <span className="text-xl font-bold tracking-tighter">LANGCHAIN</span>
                        <span className="text-xl font-bold tracking-tighter">COHERE</span>
                    </div>
                </div>
            </section>

            {/* 4. The Pathology (Problem) */}
            <div className="relative z-10">
                <PathologySection />
            </div>

            {/* 4.5. Atomic Signals (Periodic Table) */}
            <div className="relative z-10">
                <AtomicSignalsSection />
            </div>

            {/* 5. The Treatment (Solution/Workflow) */}
            <div className="relative z-10">
                <TreatmentSection />
            </div>

            {/* 6. Pricing Section */}
            <div className="relative z-10">
                <PricingSection />
            </div>

            {/* 7. CTA Footer */}
            <footer className="py-48 border-t border-white/5 relative overflow-hidden text-center bg-[#08080a]/90 backdrop-blur-md z-10">
                <div className="absolute -bottom-60 left-1/2 -translate-x-1/2 w-full max-w-5xl h-96 bg-emerald-500/10 blur-[150px] rounded-full opacity-50 pointer-events-none" />

                <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 space-y-12 relative z-10">
                    <h2 className="text-6xl md:text-[80px] font-bold tracking-tight text-white leading-[0.9]">
                        Stop praying, <br /> start testing.
                    </h2>
                    <p className="text-xl text-slate-400 max-w-xl mx-auto leading-relaxed">
                        Join the elite engineering teams using PluvianAI to build safe, scalable, and predictable AI agents.
                    </p>
                    <div className="pt-8 flex flex-col sm:flex-row gap-6 justify-center">
                        {isLoggedIn ? (
                            <Link href="/organizations">
                                <Button className="h-16 px-12 bg-emerald-500 text-black hover:bg-emerald-400 rounded-xl text-xl font-black transition-all shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)] uppercase tracking-tight">
                                    Launch Clinical Lab
                                </Button>
                            </Link>
                        ) : (
                            <Link href="/login?mode=signup&intent=free">
                                <Button className="h-16 px-12 bg-emerald-500 text-black hover:bg-emerald-400 rounded-xl text-xl font-black transition-all shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)] uppercase tracking-tight">
                                    Enter the Lab for Free
                                </Button>
                            </Link>
                        )}
                    </div>
                    <div className="flex items-center justify-center gap-6 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 pt-16">
                        <span>No credit card</span>
                        <div className="w-1 h-1 bg-slate-800 rounded-full" />
                        <span>Instant SDK integration</span>
                        <div className="w-1 h-1 bg-slate-800 rounded-full" />
                        <span>Interactive Lab</span>
                    </div>
                </div>
            </footer>

            {/* 8. Final Credits */}
            <div className="py-12 border-t border-white/5 bg-[#0a0a0c]">
                <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-2.5">
                        <Beaker className="w-5 h-5 text-emerald-500" />
                        <span className="text-sm font-bold tracking-tighter text-white uppercase">PluvianAI Atomic Lab</span>
                    </div>
                    <div className="flex gap-10 text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                        <a href="#" className="hover:text-emerald-400 transition-colors">Documentation</a>
                        <a href="#" className="hover:text-emerald-400 transition-colors">Security</a>
                        <a href="#" className="hover:text-emerald-400 transition-colors">Twitter (X)</a>
                    </div>
                    <div className="text-[11px] text-slate-700 font-bold uppercase tracking-widest">
                        © 2026 PluvianAI Inc. Verified.
                    </div>
                </div>
            </div>
        </div>
    );
}
