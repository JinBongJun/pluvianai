"use client";

import React from "react";
import { motion } from "framer-motion";
import { Brain, FileQuestion, Activity } from "lucide-react";

const pathologies = [
  {
    id: "regression",
    title: "Silent agent regressions",
    description:
      "You tweak prompts or swap models. A week later, support tickets spike — but all you see are long JSON blobs and token graphs. There's no clear “this is how the agent used to think vs now.”",
    icon: Brain,
    color: "text-red-500",
    borderColor: "group-hover:border-red-500/50",
    shadowColor: "group-hover:shadow-red-500/20",
    scanColor: "bg-red-500/50",
  },
  {
    id: "baseline",
    title: "No baseline for healthy behavior",
    description:
      "Every change is judged by gut feel. There is no fixed baseline run of real production traces to compare against, so “did we break anything?” turns into a guessing game in Slack threads.",
    icon: FileQuestion,
    color: "text-orange-500",
    borderColor: "group-hover:border-orange-500/50",
    shadowColor: "group-hover:shadow-orange-500/20",
    scanColor: "bg-orange-500/50",
  },
  {
    id: "gate",
    title: "No real gate before deploy",
    description:
      "CI says tests are green, but none of them replay your actual production conversations under the new config. There’s no PASS/FAIL gate that runs on real traces and tells you, “this node is safe to ship.”",
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
      {/* Background Abstract Typography/Shape */}
      <div className="absolute top-[10%] right-[-5%] text-[400px] font-black text-white/[0.02] pointer-events-none select-none leading-none tracking-tighter mix-blend-screen blur-[2px]">
        01
      </div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] border-[2px] border-emerald-500/10 rounded-full pointer-events-none -z-10 blur-[10px]" />

      <div className="w-[95%] max-w-[1800px] mx-auto relative z-10">
        <div className="max-w-3xl mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            We help you catch regressions before they ship.
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            Agent behavior drifts. <br />
            <span className="text-slate-500">Catch it before you deploy.</span>
          </h2>
          <p className="text-xl text-slate-400 leading-relaxed max-w-2xl">
            Model and prompt changes cause silent regressions. Without a baseline and a real gate on
            production traces, you&apos;re guessing.
          </p>
        </div>

        <motion.div
          className="grid lg:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {pathologies.map((pathology, index) => (
            <motion.div
              key={pathology.id}
              variants={cardVariants}
              whileHover={{ scale: 1.02 }}
              className={`group relative p-8 md:p-10 rounded-[32px] bg-[#121215]/95 backdrop-blur-xl border border-white/10 transition-all duration-500 hover:border-white/20 shadow-2xl overflow-hidden`}
            >
              {/* Bottom Right Glow Element */}
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500 pointer-events-none" />

              {/* Top Right Arrow Button (Figma Style) */}
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
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mb-8 bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500 text-emerald-400`}
                >
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
