"use client";

import React from "react";
import { motion } from "framer-motion";
import { Brain, FileQuestion, Activity } from "lucide-react";

const pathologies = [
  {
    id: "regression",
    title: "Behavior drifts you can’t see",
    description:
      "Prompt and model changes quietly shift how agents behave. You usually notice only after users do.",
    icon: Brain,
    color: "text-red-500",
    borderColor: "group-hover:border-red-500/50",
    shadowColor: "group-hover:shadow-red-500/20",
    scanColor: "bg-red-500/50",
  },
  {
    id: "baseline",
    title: "No real baseline to compare against",
    description:
      "Without a stable baseline, every change becomes a guessing game. You end up debating behavior instead of checking it.",
    icon: FileQuestion,
    color: "text-orange-500",
    borderColor: "group-hover:border-orange-500/50",
    shadowColor: "group-hover:shadow-orange-500/20",
    scanColor: "bg-orange-500/50",
  },
  {
    id: "gate",
    title: "No pass/fail gate on production traces",
    description:
      "CI can be green while real traces still fail in production. You need a gate that replays production behavior before deploy.",
    icon: Activity,
    color: "text-yellow-500",
    borderColor: "group-hover:border-yellow-500/50",
    shadowColor: "group-hover:shadow-yellow-500/20",
    scanColor: "bg-yellow-500/50",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

export default function PathologySection() {
  return (
    <section id="problem" className="py-32 relative bg-transparent overflow-hidden">
      <div className="absolute top-[10%] right-[-5%] text-[400px] font-black text-white/[0.02] pointer-events-none select-none leading-none tracking-tighter mix-blend-screen blur-[2px]">
        01
      </div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] border-[2px] border-emerald-500/10 rounded-full pointer-events-none -z-10 blur-[10px]" />

      <div className="w-[95%] max-w-[1800px] mx-auto relative z-10">
        <div className="max-w-3xl mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Real-trace regression checks
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            Agent behavior drifts. <br />
            <span className="text-slate-500">Catch it before you ship.</span>
          </h2>
          <p className="text-xl text-slate-400 leading-relaxed max-w-2xl">
            Model and prompt changes can break consistency. Without a real baseline and a pass/fail
            gate on production traces, you&apos;re guessing.
          </p>
        </div>

        <motion.div
          className="grid lg:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {pathologies.map((pathology) => (
            <motion.div
              key={pathology.id}
              variants={cardVariants}
              whileHover={{ scale: 1.02 }}
              className="group relative p-8 md:p-10 rounded-[32px] bg-[#121215]/95 backdrop-blur-xl border border-white/10 transition-all duration-500 hover:border-white/20 shadow-2xl overflow-hidden"
            >
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500 pointer-events-none" />

              <div className="absolute top-6 md:top-8 right-6 md:right-8 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black opacity-90 group-hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] z-10">
                <svg
                  className="w-5 h-5 -rotate-45"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </div>

              <div className="relative z-10">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-8 bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500 text-emerald-400">
                  <pathology.icon className="w-7 h-7" />
                </div>

                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4 pr-12 group-hover:text-emerald-50 transition-colors tracking-tight">
                  {pathology.title}
                </h3>
                <p className="text-sm md:text-base text-slate-300 leading-relaxed font-medium">
                  {pathology.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
