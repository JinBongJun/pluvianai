"use client";

import React from "react";

export default function AtomicSignalsSection() {
  return (
    <section id="features" className="py-32 bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent pointer-events-none" />

      <div className="w-[95%] max-w-[1800px] mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full mb-16 relative items-end">
          <div className="md:col-span-5 relative z-10">
            <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-6 leading-tight tracking-tight">
              Deterministic checks.
              <br />
              Powered by <span className="text-emerald-500">Atomic Signals</span>.
            </h2>
            <p className="text-lg text-slate-400 font-medium leading-relaxed">
              PluvianAI validates production traces for schema, PII, and logic so you can deploy
              with confidence.
            </p>
          </div>

        </div>

        {/* Asymmetrical Staggered Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
          {/* Card 1 - Smaller (Left) */}
          <div className="md:col-span-5 relative p-8 md:p-10 rounded-[32px] bg-[#121215]/95 backdrop-blur-xl border border-white/10 overflow-hidden group hover:border-white/20 transition-all shadow-2xl">
            <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500" />
            <div className="absolute top-6 md:top-8 right-6 md:right-8 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black opacity-90 group-hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] z-10">
              <svg
                className="w-5 h-5 -rotate-45"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <p className="text-base md:text-lg text-slate-300 font-medium mb-16 pr-14 leading-relaxed">
                Run deterministic checks on every trace for format, schema, and safety rules.
              </p>
              <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Atomic Signals
              </h3>
            </div>
          </div>

          {/* Card 2 - Wider (Right) */}
          <div className="md:col-span-7 relative p-8 md:p-10 rounded-[32px] bg-[#121215]/95 backdrop-blur-xl border border-white/10 overflow-hidden group hover:border-white/20 transition-all shadow-2xl">
            <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500" />
            <div className="absolute top-6 md:top-8 right-6 md:right-8 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black opacity-90 group-hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] z-10">
              <svg
                className="w-5 h-5 -rotate-45"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <p className="text-base md:text-lg text-slate-300 font-medium mb-16 pr-14 leading-relaxed max-w-md">
                Inspect every production trace in Live View and see failures at a glance.
              </p>
              <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Live View
              </h3>
            </div>
          </div>

          {/* Card 3 - Wider (Left) */}
          <div className="md:col-span-7 relative p-8 md:p-10 rounded-[32px] bg-[#121215]/95 backdrop-blur-xl border border-white/10 overflow-hidden group hover:border-white/20 transition-all shadow-2xl">
            <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500" />
            <div className="absolute top-6 md:top-8 right-6 md:right-8 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black opacity-90 group-hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] z-10">
              <svg
                className="w-5 h-5 -rotate-45"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <p className="text-base md:text-lg text-slate-300 font-medium mb-16 pr-14 leading-relaxed max-w-md">
                Replay production traces under the new config and block risky releases with
                pass/fail.
              </p>
              <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Release Gate
              </h3>
            </div>
          </div>

          {/* Card 4 - Smaller (Right) */}
          <div className="md:col-span-5 relative p-8 md:p-10 rounded-[32px] bg-[#121215]/95 backdrop-blur-xl border border-white/10 overflow-hidden group hover:border-white/20 transition-all shadow-2xl">
            <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500" />
            <div className="absolute top-6 md:top-8 right-6 md:right-8 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black opacity-90 group-hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] z-10">
              <svg
                className="w-5 h-5 -rotate-45"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <p className="text-base md:text-lg text-slate-300 font-medium mb-16 pr-14 leading-relaxed">
                Compare baseline to candidate outputs and see exactly what changed before you ship.
              </p>
              <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Behavior Diff
              </h3>
            </div>
          </div>
        </div>

        {/* Bottom Text */}
        <div className="mt-20 max-w-3xl mx-auto text-center flex items-start gap-4">
          <span className="text-xs font-mono text-slate-600 pt-1">2026</span>
          <p className="text-lg md:text-xl font-medium text-white leading-relaxed text-left">
            Validate prompt changes, swap models, and scale agents. PluvianAI turns production
            traces into clear decisions.
          </p>
        </div>
      </div>
    </section>
  );
}
