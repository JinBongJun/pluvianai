"use client";

import React from "react";
import { motion } from "framer-motion";
import { Microscope, Activity, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

const steps = [
  {
    num: "01",
    title: "Integrate",
    desc: "Connect your agent with one line of code. Production traffic instantly flows to Live View for inspection.",
    icon: Activity,
  },
  {
    num: "02",
    title: "Monitor",
    desc: "Atomic Signals evaluate every trace for format, logic, and safety. Spot failures and anomalies at a glance.",
    icon: Microscope,
  },
  {
    num: "03",
    title: "Gate",
    desc: "Replay traces under your new config. Get a behavior diff and a strict pass/fail Release Gate before you deploy.",
    icon: ShieldCheck,
  },
];

export default function TreatmentSection() {
  return (
    <section
      id="workflow"
      className="py-32 bg-transparent border-y border-white/5 relative overflow-hidden"
    >
      <div className="w-[95%] max-w-[1800px] mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-center">
          {/* Left: Content Timeline (Figma Style) */}
          <div className="w-full lg:w-3/5">
            <div className="flex flex-col md:flex-row gap-12 md:gap-8 justify-between relative">
              {/* Horizontal Connecting Line (Desktop) */}
              <div className="hidden md:block absolute top-[52px] left-8 right-8 h-[1px] bg-white/20 z-0">
                {/* Right arrow tip */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 border-t border-r border-white/40 rotate-45 transform translate-x-1" />
                {/* Left end hash */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[1px] h-3 bg-white/40" />
              </div>

              {/* Vertical Connecting Line (Mobile) */}
              <div className="block md:hidden absolute top-8 bottom-8 left-[38px] w-[1px] bg-white/20 z-0"></div>

              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="relative z-10 flex flex-row md:flex-col items-start gap-6 md:gap-4 md:w-1/3"
                >
                  <div className="flex-shrink-0">
                    <span className="text-5xl md:text-6xl font-black text-white tracking-tighter">
                      {step.num}
                    </span>
                  </div>

                  <div className="space-y-3 pt-2 md:pt-0">
                    <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed font-medium">
                      {step.desc}
                    </p>

                    {/* Nodes matching Figma timeline */}
                    <div className="hidden md:flex items-center gap-2 mt-4">
                      <div className="flex -space-x-2">
                        <div className="w-8 h-8 rounded-full border-2 border-black bg-[#111111] flex items-center justify-center">
                          <step.icon className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="w-8 h-8 rounded-full border-2 border-black bg-[#111111] flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <div className="w-8 h-8 rounded-full border-2 border-black bg-[#111111] flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-20 flex flex-col sm:flex-row items-center gap-6">
              <Button className="h-16 px-12 text-xl !font-extrabold rounded-full bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_60px_-10px_rgba(16,185,129,0.55)] hover:shadow-[0_0_80px_-10px_rgba(16,185,129,0.75)] transition-all hover:scale-[1.03]">
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span>Slots are available</span>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
          </div>

          {/* Right: Visual (Code/Terminal) */}
          <div className="w-full lg:w-2/5 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 blur-[80px] rounded-full pointer-events-none -z-10" />
            <div className="relative rounded-3xl bg-black border border-white/10 shadow-2xl overflow-hidden group">
              <div className="absolute top-0 w-full h-10 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                <div className="ml-4 text-xs font-mono text-slate-500">app.py</div>
              </div>

              <div className="p-8 pt-16 font-mono text-sm overflow-hidden">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">1</span>
                    <span className="text-emerald-400">import</span>{" "}
                    <span className="text-white">pluvianai</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">2</span>
                    <span></span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">3</span>
                    <span className="text-white">pluvianai.</span>
                    <span className="text-cyan-400">init</span>
                    <span className="text-white">(api_key=</span>
                    <span className="text-emerald-300">&quot;YOUR_API_KEY&quot;</span>
                    <span className="text-white">)</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-slate-600 select-none">4</span>
                    <span className="text-slate-500"># Traffic flows to Live View</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
