"use client";

import React from "react";

/**
 * SilkGradientBg — Figma-style silk/fabric flowing gradient background
 * Creates the characteristic diagonal flowing silk texture using SVG + CSS layers.
 * Designed for hero sections and CTA footers.
 */
export default function SilkGradientBg({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "footer";
  className?: string;
}) {
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      {/* === SVG Silk Fabric Gradient === */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Main silk flow gradient */}
          <linearGradient id="silk-flow-1" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="30%" stopColor="#059669" stopOpacity="0.15" />
            <stop offset="60%" stopColor="#064e3b" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>

          {/* Secondary silk highlight */}
          <linearGradient id="silk-flow-2" x1="80%" y1="0%" x2="20%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.12" />
            <stop offset="40%" stopColor="#0891b2" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>

          {/* Bright edge highlight (silk fold catch light) */}
          <linearGradient id="silk-edge" x1="90%" y1="0%" x2="10%" y2="80%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
            <stop offset="15%" stopColor="#10b981" stopOpacity="0.12" />
            <stop offset="40%" stopColor="#064e3b" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>

          {/* Deep shadow gradient for fold depth */}
          <linearGradient id="silk-shadow" x1="70%" y1="10%" x2="30%" y2="90%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="40%" stopColor="#022c22" stopOpacity="0.15" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>

          {/* Gaussian blur for silk softness */}
          <filter id="silk-blur-soft">
            <feGaussianBlur stdDeviation="30" />
          </filter>
          <filter id="silk-blur-medium">
            <feGaussianBlur stdDeviation="15" />
          </filter>
          <filter id="silk-blur-sharp">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Layer 1: Deep base silk flow (most blurred, widest) */}
        <path
          d="M 1600 -100 C 1400 100, 1200 200, 1000 350 C 800 500, 600 450, 400 600 C 200 750, 0 700, -100 900 L 1600 900 Z"
          fill="url(#silk-flow-1)"
          filter="url(#silk-blur-soft)"
        />

        {/* Layer 2: Mid silk fabric fold */}
        <path
          d="M 1500 -50 C 1350 80, 1200 150, 1050 280 C 900 410, 750 380, 550 520 C 350 660, 200 620, 50 800 L 1500 800 Z"
          fill="url(#silk-flow-2)"
          filter="url(#silk-blur-medium)"
        />

        {/* Layer 3: Sharp edge highlight (silk light catch) */}
        <path
          d="M 1550 -80 C 1400 30, 1280 100, 1100 230 C 920 360, 800 340, 650 450 C 500 560, 350 530, 180 680 L 1550 700 Z"
          fill="url(#silk-edge)"
          filter="url(#silk-blur-sharp)"
          opacity="0.8"
        />

        {/* Layer 4: Secondary fold wave */}
        <path
          d="M 1600 50 C 1450 150, 1350 250, 1150 350 C 950 450, 850 500, 700 580 C 550 660, 400 700, 200 850 L 1600 850 Z"
          fill="url(#silk-shadow)"
          filter="url(#silk-blur-medium)"
        />

        {/* Layer 5: Inner bright edge for depth */}
        <path
          d="M 1480 -30 C 1380 50, 1250 120, 1080 250 C 910 380, 780 350, 620 470 C 460 590, 350 560, 200 700"
          fill="none"
          stroke="url(#silk-edge)"
          strokeWidth="60"
          filter="url(#silk-blur-medium)"
          opacity="0.4"
        />
      </svg>

      {/* === CSS Supplement Layers === */}
      {/* Ambient glow for additional warmth */}
      <div className="absolute top-[-10%] right-[-5%] w-[50%] h-[60%] bg-gradient-to-bl from-emerald-500/10 via-transparent to-transparent blur-[80px]" />

      {/* Faint secondary color accent */}
      <div className="absolute bottom-[10%] left-[5%] w-[40%] h-[40%] bg-gradient-to-tr from-cyan-600/5 via-transparent to-transparent blur-[60px]" />

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
    </div>
  );
}
