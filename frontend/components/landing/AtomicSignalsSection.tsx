"use client";

import React from "react";

export default function AtomicSignalsSection() {
  return (
    <section id="features" className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-900/10 via-black/40 to-black/80 pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6 border border-cyan-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          Atomic Signals
        </div>
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          Rule-based checks for agent quality.
        </h2>
        <p className="text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
          Deterministic checks: latency, JSON, length, refusal, PII, tool policy, and more.
        </p>
      </div>
    </section>
  );
}
