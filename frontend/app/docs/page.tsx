'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { ChevronRight, Book, Shield, Zap, Beaker } from 'lucide-react';
import Link from 'next/link';

export default function DocsPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white">
            {/* Header / Navbar (Simple version) */}
            <nav className="border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <Beaker className="w-6 h-6 text-emerald-500" />
                        <span className="font-black tracking-tighter text-xl">PLUVIAN<span className="text-emerald-500">AI</span></span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link href="/login" className="text-sm font-bold text-slate-400 hover:text-white transition-colors">Log In</Link>
                        <Link href="/organizations">
                            <Button size="sm" className="h-9 px-4 text-xs">Start Validation</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 py-20 flex gap-12">
                {/* Sidebar Navigation */}
                <aside className="w-64 hidden lg:block shrink-0">
                    <div className="sticky top-32 space-y-8">
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">Getting Started</h3>
                            <div className="space-y-1">
                                {['Introduction', 'Quickstart', 'Key Concepts', 'Architecture'].map(item => (
                                    <button key={item} className="flex w-full items-center justify-between p-2 rounded-md hover:bg-white/5 text-sm font-bold text-slate-400 hover:text-emerald-400 transition-all text-left">
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">Core Lab</h3>
                            <div className="space-y-1">
                                {['Atomic Signals', 'Logic Guard', 'Security Scans', 'Trace History'].map(item => (
                                    <button key={item} className="flex w-full items-center justify-between p-2 rounded-md hover:bg-white/5 text-sm font-bold text-slate-400 hover:text-emerald-400 transition-all text-left">
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-grow max-w-3xl">
                    <div className="space-y-12">
                        <div>
                            <h1 className="text-5xl font-black tracking-tight mb-6">Introduction</h1>
                            <p className="text-xl text-slate-400 leading-relaxed font-medium">
                                Welcome to the PluvianAI Clinical Lab documentation. Pluvian is a symbiotic validation layer designed to "cure" AI agents from hallucinations, PII leaks, and logic breakdowns.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="p-6 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-all group">
                                <Zap className="w-8 h-8 text-emerald-400 mb-4" />
                                <h3 className="text-xl font-bold mb-2">Quickstart</h3>
                                <p className="text-sm text-slate-500 leading-relaxed mb-4">Integrate the Pluvian SDK in under 5 minutes and begin monitoring signal health.</p>
                                <div className="flex items-center text-xs font-bold text-emerald-400 uppercase tracking-widest group-hover:gap-2 transition-all">
                                    Read Guide <ChevronRight className="w-3 h-3" />
                                </div>
                            </div>
                            <div className="p-6 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all group">
                                <Shield className="w-8 h-8 text-cyan-400 mb-4" />
                                <h3 className="text-xl font-bold mb-2">Atomic Signals</h3>
                                <p className="text-sm text-slate-500 leading-relaxed mb-4">Deep dive into the 13 fundamental elements of AI risk and how we measure them.</p>
                                <div className="flex items-center text-xs font-bold text-cyan-400 uppercase tracking-widest group-hover:gap-2 transition-all">
                                    Browse Elements <ChevronRight className="w-3 h-3" />
                                </div>
                            </div>
                        </div>

                        <div className="prose prose-invert max-w-none">
                            <h2 className="text-3xl font-black tracking-tight">Core Methodology</h2>
                            <p className="text-slate-400 leading-relaxed">
                                Pluvian operates on a "Symbiotic Guard" principle. Instead of just logging errors in a database, we act as an active layer in your agent's execution loop.
                            </p>
                            <pre className="p-6 rounded-xl bg-black border border-white/10 overflow-x-auto">
                                <code className="text-emerald-400 font-mono text-sm leading-relaxed">
                                    {`from pluvian import Guard

# Connect your agent to the clinic
with Guard() as patient:
    output = my_agent.query("Clinical prompt")
    
    # Intercept and cure logic errors
    if patient.is_unhealthy():
        patient.cure()`}
                                </code>
                            </pre>
                        </div>
                    </div>
                </main>
            </div>

            {/* Simple Footer */}
            <footer className="py-20 border-t border-white/5 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    © 2026 PluvianAI Inc. Clinical Docs v1.0
                </p>
            </footer>
        </div>
    );
}
