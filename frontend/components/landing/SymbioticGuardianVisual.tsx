"use client";

import { motion } from "framer-motion";

export default function SymbioticGuardianVisual() {
  return (
    <div className="relative w-full max-w-4xl mx-auto h-[400px] md:h-[500px] flex items-center justify-center opacity-90 pointer-events-none select-none">
      {/* 1. The Crocodile Jaw (Wireframe / Bone Structure) */}
      <svg
        viewBox="0 0 800 500"
        className="w-full h-full drop-shadow-[0_0_15px_rgba(16,185,129,0.1)]"
      >
        <motion.path
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
          d="M 100 300 Q 300 450 700 350" // Lower Jaw
          fill="none"
          stroke="#0f3d2e" // Dark Emerald
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-60"
        />
        <motion.path
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut", delay: 0.5 }}
          d="M 100 200 Q 300 50 700 150" // Upper Jaw
          fill="none"
          stroke="#0f3d2e" // Dark Emerald
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-60"
        />

        {/* Teeth (Triangles) */}
        {[150, 250, 350, 450, 550].map((x, i) => (
          <motion.path
            key={`tooth-lower-${i}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + i * 0.1 }}
            d={`M ${x} 340 L ${x + 20} 300 L ${x + 40} 340`}
            fill="none"
            stroke="#10b981" // Bio Emerald
            strokeWidth="1.5"
            className="opacity-40"
          />
        ))}

        {[180, 280, 380, 480, 580].map((x, i) => (
          <motion.path
            key={`tooth-upper-${i}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 + i * 0.1 }}
            d={`M ${x} 180 L ${x + 20} 220 L ${x + 40} 180`}
            fill="none"
            stroke="#10b981" // Bio Emerald
            strokeWidth="1.5"
            className="opacity-40"
          />
        ))}
      </svg>

      {/* 2. The Pluvian (The Cure Bird) - Replaced Dot with SVG Bird */}
      <motion.div
        className="absolute w-12 h-12 flex items-center justify-center"
        initial={{
          top: "10%",
          left: "-10%",
          opacity: 0,
          scale: 0.5,
          rotate: 15,
        }}
        animate={{
          // Distinct Phases:
          // 0% - 30%: Fly In (Curve)
          // 30% - 50%: Land & Stabilize
          // 50% - 100%: Clean/Scan (Bobbing)
          top: ["10%", "30%", "45%", "45%", "43%", "47%", "45%"],
          left: ["-10%", "20%", "45%", "45%", "50%", "40%", "45%"],
          opacity: [0, 1, 1, 1, 1, 1, 1],
          scale: [0.8, 1.2, 1, 1, 1, 1, 1],
          rotate: [15, 0, 0, 0, -5, 5, 0], // Tilt while cleaning
        }}
        transition={{
          duration: 8, // Slower, more majestic
          times: [0, 0.25, 0.35, 0.4, 0.6, 0.8, 1],
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 1,
        }}
      >
        {/* Glowing Aura */}
        <div className="absolute inset-0 bg-cyan-400/30 rounded-full blur-xl animate-pulse" />

        {/* Bird Icon SVG */}
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)] filter"
        >
          <path d="M16 7h.01" />
          <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
          <path d="m20 7 2 .5-2 .5" />
          <path d="M10 18v3" />
          <path d="M14 17.75V21" />
          <path d="M7 18a6 6 0 0 0 3.84-10.61" />
        </svg>

        {/* Scanning Beam (Only appears during cleaning phase) */}
        <motion.div
          className="absolute top-full left-1/2 -translate-x-1/2 w-[150px] h-[200px] bg-gradient-to-b from-cyan-500/20 to-transparent opacity-0 pointer-events-none"
          style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
          animate={{ opacity: [0, 0, 0, 0.6, 0.6, 0.6, 0] }}
          transition={{
            duration: 8,
            times: [0, 0.25, 0.35, 0.4, 0.6, 0.8, 1],
            repeat: Infinity,
            repeatDelay: 1,
          }}
        />
      </motion.div>

      {/* 3. Data Particles (Pathogens being cleaned) */}
      <div className="absolute top-[50%] left-[55%]">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 2, 0],
            opacity: [0, 1, 0],
            y: [0, -20, -40], // Float up like getting cleaned
          }}
          transition={{ duration: 2, delay: 3.5, repeat: Infinity, repeatDelay: 6 }}
          className="w-3 h-3 bg-red-500 rounded-full blur-[2px] shadow-[0_0_10px_rgba(239,68,68,0.8)]"
        />
      </div>

      {/* Label */}
      <div className="absolute bottom-10 right-10 flex flex-col items-end">
        <div className="text-[10px] text-emerald-500/50 font-mono tracking-widest uppercase">
          Status: Symbiosis Active
        </div>
        <div className="text-[10px] text-cyan-500/50 font-mono tracking-widest uppercase">
          Target: Hallucination 0.0%
        </div>
      </div>
    </div>
  );
}
