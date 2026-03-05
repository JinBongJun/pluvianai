"use client";

import React from "react";
import { motion } from "framer-motion";
import { Microscope, Activity, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

const steps = [
  {
    num: "01",
    title: "Integrate",
    desc: "Connect your agent to PluvianAI with one line of code. Traffic flows to Live View and is available for inspection and gating.",
    icon: Activity,
  },
  {
    num: "02",
    title: "Monitor",
    desc: "Atomic Signals and policy rules evaluate each trace for hallucinations, PII, schema, and logic. View results per node in Live View.",
    icon: Microscope,
  },
  {
    num: "03",
    title: "Gate",
    desc: "Run Release Gate: replay production traces with your new config, get a behavior diff and a strict pass/fail before you ship.",
    icon: ShieldCheck,
  },
];

export default function TreatmentSection() {
  return (
    <section id="workflow" className="py-32 bg-black/20 border-y border-white/5 relative">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-20 items-center">
          {/* Left: Content */}
          <div className="lg:w-1/2 space-y-12">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                How it works
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                PluvianAI workflow: <br />
                <span className="text-emerald-400">Ingest, evaluate, gate.</span>
              </h2>
              <p className="text-xl text-slate-400 leading-relaxed">
                Ingest traffic via SDK, run atomic checks in Live View, and run Release Gate on
                real traces for a clear pass/fail before you deploy.
              </p>
            </div>

            <div className="space-y-12 relative">
              {/* Connecting Line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-emerald-500/10" />

              {steps.map((step, idx) => (
                <div key={idx} className="relative flex gap-8 group">
                  <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-xl bg-[#0a0a0c] border border-emerald-500/20 flex items-center justify-center font-mono text-emerald-500 text-sm group-hover:bg-emerald-500 group-hover:text-black transition-colors duration-300 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]">
                    <step.icon className="w-5 h-5" />
                  </div>
                  <div className="pt-1">
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
                      {step.title}
                    </h3>
                    <p className="text-slate-400 leading-relaxed text-[15px]">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Visual (Code/Terminal) */}
          <div className="lg:w-1/2 w-full">
            <div className="relative rounded-2xl bg-[#0a0a0c] border border-white/10 shadow-2xl overflow-hidden group">
              <div className="absolute top-0 w-full h-10 bg-[#111115] border-b border-white/5 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/20" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/20" />
                <div className="ml-4 text-xs font-mono text-slate-600">app.py</div>
              </div>

              <div className="p-8 pt-16 font-mono text-sm overflow-hidden">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">1</span>
                    <span className="text-cyan-400">import</span>{" "}
                    <span className="text-white">agentguard</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">2</span>
                    <span></span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">3</span>
                    <span className="text-white">agentguard.</span>
                    <span className="text-emerald-400">init</span>
                    <span className="text-white">(api_key=</span>
                    <span className="text-amber-300">&quot;YOUR_API_KEY&quot;</span>
                    <span className="text-white">)</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">4</span>
                    <span className="text-slate-400"># Traffic flows to Live View; run Release Gate on traces.</span>
                  </div>
                </div>
              </div>

              {/* Scanning overlay */}
              <motion.div
                className="absolute inset-0 bg-emerald-500/5 pointer-events-none border-b-2 border-emerald-500/50"
                animate={{ top: ["-100%", "200%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
