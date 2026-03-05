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
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293720_1px,transparent_1px),linear-gradient(to_bottom,#1f293720_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-3xl mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-widest mb-6 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
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
              className={`group relative p-8 rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 transition-all duration-500 ${pathology.borderColor} ${pathology.shadowColor} hover:shadow-2xl overflow-hidden`}
            >
              {/* HUD Corners (Brackets) */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/20 group-hover:border-emerald-500/50 transition-colors duration-500 rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/20 group-hover:border-emerald-500/50 transition-colors duration-500 rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/20 group-hover:border-emerald-500/50 transition-colors duration-500 rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/20 group-hover:border-emerald-500/50 transition-colors duration-500 rounded-br-sm" />

              {/* Scanning Laser Effect on Hover */}
              <motion.div
                className={`absolute inset-x-0 h-[2px] ${pathology.scanColor} shadow-[0_0_15px_rgba(255,255,255,0.5)] z-20`}
                initial={{ top: "-10%" }}
                whileHover={{
                  top: "120%",
                  transition: { duration: 1.5, repeat: Infinity, ease: "linear" as const },
                }}
              />

              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center mb-8 bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500 ${pathology.color}`}
              >
                <pathology.icon className="w-7 h-7" />
              </div>

              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-emerald-50 transition-colors">
                {pathology.title}
              </h3>
              <p className="text-slate-400 leading-relaxed font-light">{pathology.description}</p>

              {/* Tech Decor: Deterministic numbers/lines */}
              <div className="absolute right-4 bottom-4 flex flex-col items-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity duration-500">
                <span className="text-[10px] font-mono text-emerald-500">
                  SYS.DIAG.0{index + 1}
                </span>
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping" />
                  <div className="w-8 h-[2px] bg-emerald-500/50" />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
