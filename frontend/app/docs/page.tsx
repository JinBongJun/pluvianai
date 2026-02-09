'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChevronRight, Shield, Zap, Book, Layers, Search, History, Activity } from 'lucide-react';
import Link from 'next/link';

type SectionId = 'introduction' | 'quickstart' | 'key-concepts' | 'architecture' | 'logic-guard' | 'security-scans' | 'trace-history';

interface ContentItem {
    id: SectionId;
    title: string;
    icon: React.ReactNode;
    content: React.ReactNode;
}

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState<SectionId>('introduction');

    const DOCS_CONTENT: Record<SectionId, ContentItem> = {
        'introduction': {
            id: 'introduction',
            title: 'Introduction',
            icon: <Book className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-2xl text-slate-400 leading-relaxed font-semibold max-w-4xl">
                        Welcome to the PluvianAI Clinical Lab documentation. Pluvian is a <span className="text-white">symbiotic validation layer</span> designed to "cure" AI agents from hallucinations, PII leaks, and logic breakdowns.
                    </p>
                    <div className="grid md:grid-cols-1 gap-8">
                        <div className="p-10 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-all group cursor-pointer max-w-2xl" onClick={() => setActiveSection('quickstart')}>
                            <Zap className="w-12 h-12 text-emerald-400 mb-6" />
                            <h3 className="text-2xl font-black mb-4">Quickstart Guide</h3>
                            <p className="text-lg text-slate-500 leading-relaxed mb-6">Learn how to integrate the Pluvian SDK in under 5 minutes and begin monitoring cognitive signal health with clinical precision.</p>
                            <div className="flex items-center text-sm font-black text-emerald-400 uppercase tracking-widest group-hover:gap-3 transition-all">
                                Start Integration <ChevronRight className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        'quickstart': {
            id: 'quickstart',
            title: 'Quickstart Guide',
            icon: <Zap className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-10">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Get PluvianAI running in your environment in 3 simple steps.
                    </p>
                    <div className="space-y-12">
                        <section className="space-y-4">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black text-sm">1</span>
                                Install SDK
                            </h3>
                            <pre className="p-6 rounded-xl bg-black border border-white/10 overflow-x-auto">
                                <code className="text-emerald-400 font-mono text-lg">npm install @pluvian/sdk</code>
                            </pre>
                        </section>
                        <section className="space-y-4">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black text-sm">2</span>
                                Initialize Guard
                            </h3>
                            <pre className="p-10 rounded-2xl bg-[#0a0a0c] border border-white/10 overflow-x-auto shadow-2xl">
                                <code className="text-emerald-400 font-mono text-lg leading-relaxed">
                                    {`import { Pluvian } from '@pluvian/sdk';

const pluvian = new Pluvian({
    apiKey: process.env.PLUVIAN_API_KEY
});`}
                                </code>
                            </pre>
                        </section>
                    </div>
                </div>
            )
        },
        'key-concepts': {
            id: 'key-concepts',
            title: 'Key Concepts',
            icon: <Activity className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-10">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Deep dive into the cognitive signals and validation mechanisms that power PluvianAI.
                    </p>
                    <div className="grid grid-cols-1 gap-6">
                        <div className="p-8 rounded-xl bg-white/5 border border-white/10">
                            <h4 className="text-xl font-bold mb-3 text-white">Symbiotic Guard</h4>
                            <p className="text-slate-400">Unlike passive monitors, Pluvian lives within your agent's execution loop. It intercepts outputs, validates them against "Pathogens" (hallucinations, leaks), and applies a "Cure" before the user ever sees the error.</p>
                        </div>
                        <div className="p-8 rounded-xl bg-white/5 border border-white/10">
                            <h4 className="text-xl font-bold mb-3 text-white">Atomic Signals</h4>
                            <p className="text-slate-400">We decompose AI risk into 13 discrete signals (e.g., Semantic Integrity, Logic Gaps). Each signal represents a measurable aspect of agent stability.</p>
                        </div>
                    </div>
                </div>
            )
        },
        'architecture': {
            id: 'architecture',
            title: 'Architecture',
            icon: <Layers className="w-12 h-12 text-emerald-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Pluvian sits between your LLM Orchestrator (LangChain, AutoGPT, etc.) and your API Interface.
                    </p>
                    <div className="p-16 rounded-2xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-xs font-bold">LLM MODEL</div>
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                            <div className="p-4 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-xs font-bold text-emerald-400 animate-pulse">PLUVIAN GUARD</div>
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-xs font-bold">END USER</div>
                        </div>
                        <span className="text-slate-600 font-bold uppercase tracking-[0.2em] text-[10px] mt-4">Transparent Validation Proxy</span>
                    </div>
                </div>
            )
        },
        'logic-guard': {
            id: 'logic-guard',
            title: 'Logic Guard',
            icon: <Shield className="w-12 h-12 text-cyan-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Prevent hallucinations by enforcing deterministic rules on non-deterministic models. Logic Guard ensures your agent doesn't "invent" facts or skip critical workflow steps.
                    </p>
                </div>
            )
        },
        'security-scans': {
            id: 'security-scans',
            title: 'Security Scans',
            icon: <Search className="w-12 h-12 text-orange-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Real-time PII scrubbing, secret detection, and prompt-injection prevention. Protect your sensitive data and model integrity without slowing down execution.
                    </p>
                </div>
            )
        },
        'trace-history': {
            id: 'trace-history',
            title: 'Trace History',
            icon: <History className="w-12 h-12 text-slate-400 mb-6" />,
            content: (
                <div className="space-y-8">
                    <p className="text-xl text-slate-400 leading-relaxed max-w-4xl">
                        Every validation, correction, and signal metric is stored in your private trace history. Replay historic runs to optimize your "Immune System" rules.
                    </p>
                </div>
            )
        }
    };

    const sidebarItems = [
        {
            category: 'Getting Started',
            links: [
                { id: 'introduction', label: 'Introduction' },
                { id: 'quickstart', label: 'Quickstart' },
                { id: 'key-concepts', label: 'Key Concepts' },
                { id: 'architecture', label: 'Architecture' }
            ]
        },
        {
            category: 'Core Lab',
            links: [
                { id: 'logic-guard', label: 'Logic Guard' },
                { id: 'security-scans', label: 'Security Scans' },
                { id: 'trace-history', label: 'Trace History' }
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white selection:bg-emerald-500/30 font-sans">
            {/* 1. Navbar */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl">
                <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 h-[100px] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="flex items-center gap-4 group">
                            <div className="relative w-16 h-16 pointer-events-none select-none group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                                    <path
                                        d="M20 50 C 20 20, 80 20, 80 50 L 80 80 L 20 80 Z"
                                        fill="none"
                                        stroke="#06b6d4"
                                        strokeWidth="4"
                                        className="animate-pulse"
                                    />
                                    <circle cx="40" cy="45" r="5" fill="#10b981" />
                                    <path d="M60 60 L 90 40" stroke="#10b981" strokeWidth="2" />
                                </svg>
                            </div>
                            <span className="text-3xl font-bold tracking-tight text-white group-hover:text-emerald-400 transition-colors">PluvianAI</span>
                        </Link>
                    </div>

                    <div className="flex items-center gap-8 lg:gap-10">
                        <div className="hidden md:flex items-center gap-6 text-lg font-bold">
                            <Link href="/login" className="text-slate-400 hover:text-white transition-colors">Log In</Link>
                        </div>
                        <Link href="/organizations">
                            <Button className="bg-emerald-500 text-black font-black px-8 h-12 text-lg rounded-md shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-105 whitespace-nowrap">
                                Start Validation
                            </Button>
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 py-[160px] flex gap-16">
                {/* Sidebar Navigation */}
                <aside className="w-72 hidden lg:block shrink-0">
                    <div className="sticky top-[160px] space-y-10">
                        {sidebarItems.map(group => (
                            <div key={group.category}>
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-6">{group.category}</h3>
                                <div className="space-y-2">
                                    {group.links.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveSection(item.id as SectionId)}
                                            className={`flex w-full items-center justify-between p-3 rounded-md transition-all text-left text-base font-bold
                                                ${activeSection === item.id
                                                    ? 'bg-emerald-500/10 text-emerald-400 shadow-[inset_4px_0_0_0_#10b981]'
                                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-grow max-w-5xl overflow-hidden">
                    <div key={activeSection} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="space-y-16">
                            <div className="space-y-6">
                                {DOCS_CONTENT[activeSection].icon}
                                <h1 className="text-6xl md:text-7xl font-black tracking-tight mb-8">
                                    {DOCS_CONTENT[activeSection].title}
                                </h1>
                                {DOCS_CONTENT[activeSection].content}
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Simple Footer */}
            <footer className="py-32 border-t border-white/5 text-center bg-[#08080a]">
                <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-600">
                    © 2026 PluvianAI Inc. Clinical Docs v1.0
                </p>
            </footer>
        </div>
    );
}
