"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Bot,
  Zap,
  Shield,
  BarChart3,
  ChevronRight,
  Beaker,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Cpu,
  ArrowRight,
  Terminal,
  Search,
  History,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import SymbioticGuardianVisual from "@/components/landing/SymbioticGuardianVisual";
import PathologySection from "@/components/landing/PathologySection";
import TreatmentSection from "@/components/landing/TreatmentSection";
import AtomicSignalsSection from "@/components/landing/AtomicSignalsSection";
import PricingSection from "@/components/landing/PricingSection";
import InteractiveHoverText from "@/components/ui/InteractiveHoverText";
import SilkGradientBg from "@/components/landing/SilkGradientBg";
import { useAuthSession } from "@/hooks/useAuthSession";
import PluvianLogoMark from "@/components/brand/PluvianLogoMark";

export default function Home() {
  const { isAuthenticated: isLoggedIn } = useAuthSession();

  return (
    <div className="min-h-screen text-slate-200 selection:bg-emerald-500/30 font-sans relative">
      {/* ====== Global Vector Shapes & Curtain Lights ====== */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 mix-blend-screen">
        {/* 1. Global Diagonal Curtain Lights (Upper-Mid Section) */}
        <div className="fixed top-[20%] right-[-10%] w-[120%] h-[300px] bg-gradient-to-r from-transparent via-cyan-900/20 to-transparent -rotate-[35deg] blur-[60px] pointer-events-none" />
        <div className="fixed top-[40%] right-[-20%] w-[150%] h-[400px] bg-gradient-to-r from-transparent via-emerald-900/15 to-transparent -rotate-[35deg] blur-[80px] pointer-events-none" />
        {/* 2. Middle Section Vector Capsules (Near Pathology/Treatment) */}
        <div className="absolute top-[1200px] -left-[120px] w-[250px] h-[600px] border-[8px] border-cyan-500 rounded-r-full opacity-60 shadow-[0_0_50px_rgba(6,182,212,0.3)]" />
        <div className="absolute top-[2800px] -right-[250px] w-[600px] h-[900px] border-[10px] border-emerald-500 rounded-l-full opacity-50 shadow-[0_0_70px_rgba(16,185,129,0.2)]" />
        <div className="absolute top-[3500px] -left-[100px] w-[200px] h-[300px] border-[8px] border-white/80 rounded-r-full opacity-80 shadow-[0_0_40px_rgba(255,255,255,0.2)]" />
      </div>

      {/* 1. Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl">
        <div className="w-full px-6 md:px-12 lg:px-16 h-[90px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 pointer-events-none select-none hover:scale-105 transition-transform duration-300 flex items-center justify-center">
              <PluvianLogoMark className="h-full w-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]" />
            </div>
            <span className="text-3xl font-black tracking-tighter text-white uppercase transition-colors group-hover:text-emerald-400">
              PLUVIANAI
            </span>
          </div>

          {/* Right Side Navigation & Actions */}
          <div className="flex items-center gap-8 lg:gap-10">
            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex items-center gap-8 md:gap-10">
              {/* Platform Dropdown */}
              <div className="relative group/nav">
                <button className="flex items-center gap-1.5 text-lg font-bold text-slate-400 hover:text-emerald-400 transition-colors py-8">
                  Platform
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="group-hover/nav:rotate-180 transition-transform duration-300"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {/* Dropdown Menu - Aligned to Right */}
                <div className="absolute top-[80px] right-0 w-64 opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 translate-y-2 group-hover/nav:translate-y-0 z-[60]">
                  <div className="p-2 rounded-lg bg-[#0a0a0c]/90 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
                    <div className="grid gap-1">
                      <a
                        href="#problem"
                        className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item"
                      >
                        <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">
                          Logic Guard
                        </span>
                        <span className="text-xs text-slate-500">Hallucination Prevention</span>
                      </a>
                      <a
                        href="#features"
                        className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item"
                      >
                        <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">
                          Atomic Lab
                        </span>
                        <span className="text-xs text-slate-500">
                          The Periodic Table of AI Risk
                        </span>
                      </a>
                      <a
                        href="#workflow"
                        className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item"
                      >
                        <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">
                          Surgical Workflow
                        </span>
                        <span className="text-xs text-slate-500">
                          Clinical Integration & Treatment
                        </span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <a
                href="#pricing"
                className="text-lg font-extrabold text-slate-400 hover:text-emerald-400 transition-colors"
              >
                Pricing
              </a>
              <a
                href="/docs"
                className="text-lg font-extrabold text-slate-400 hover:text-emerald-400 transition-colors"
              >
                Docs
              </a>
            </div>

            <div className="h-8 w-[1px] bg-white/10 hidden lg:block" />

            {isLoggedIn ? (
              <Link href="/organizations">
                <Button className="bg-emerald-500 hover:bg-emerald-400 text-black !font-extrabold px-10 h-12 text-lg rounded-full shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-105 whitespace-nowrap uppercase tracking-widest">
                  Guard My Agents
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            ) : (
              <>
                <div className="hidden md:flex items-center gap-6 text-lg font-bold">
                  <Link href="/login" className="text-slate-400 hover:text-white transition-colors">
                    Log In
                  </Link>
                  <Link
                    href="/login?mode=signup"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Sign Up
                  </Link>
                </div>
                <Link href="/login?intent=validation">
                  <Button className="bg-emerald-500 hover:bg-emerald-400 text-black !font-extrabold px-8 h-12 text-lg rounded-full shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-105 whitespace-nowrap uppercase tracking-widest">
                    Guard My Agents
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-40 pb-20 overflow-hidden bg-[#030303] z-10 transition-all duration-700">
        {/* ====== Flashy Geometric Light Beams Background ====== */}

        {/* -- LEFT BEAM (Cyan/Emerald) -- */}
        <div
          className="absolute top-1/2 -left-[50%] md:-left-[25%] w-[80%] md:w-[45%] h-[180%] -translate-y-1/2 rounded-[100%] pointer-events-none -z-10
            border-r-[6px] border-cyan-300 
            bg-gradient-to-l from-cyan-400/40 via-emerald-800/20 to-transparent 
            shadow-[inset_-60px_0_150px_rgba(34,211,238,0.5),_10px_0_80px_rgba(16,185,129,0.4)] 
            opacity-90 transform-gpu rotate-[-6deg] md:rotate-[-4deg]"
        />

        {/* -- RIGHT BEAM (Emerald/Cyan) -- */}
        <div
          className="absolute top-1/2 -right-[50%] md:-right-[25%] w-[80%] md:w-[45%] h-[180%] -translate-y-1/2 rounded-[100%] pointer-events-none -z-10
            border-l-[6px] border-emerald-300 
            bg-gradient-to-r from-emerald-400/40 via-cyan-800/20 to-transparent 
            shadow-[inset_60px_0_150px_rgba(16,185,129,0.5),_-10px_0_80px_rgba(34,211,238,0.4)] 
            opacity-90 transform-gpu rotate-[6deg] md:rotate-[4deg]"
        />

        {/* -- BOTTOM FLARE -- */}
        <div
          className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[80%] h-[40%] pointer-events-none -z-10
            bg-gradient-to-t from-cyan-950/60 via-emerald-900/20 to-transparent 
            blur-[80px] rounded-full mix-blend-screen"
        />

        {/* Center vignette to push focus to text */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,transparent_30%,#030303_100%)] pointer-events-none -z-10 opacity-80" />

        <div className="w-full max-w-[1400px] mx-auto px-6 relative z-10 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-sm font-bold tracking-widest uppercase mb-16 shadow-[0_0_30px_-5px_rgba(16,185,129,0.2)] backdrop-blur-md hover:border-emerald-500/40 transition-colors cursor-default">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            Clinical Grade Validation
          </div>

          <div className="max-w-6xl mx-auto space-y-10">
            <div className="space-y-4">
              <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight text-white leading-[1.1] drop-shadow-2xl">
                The Symbiotic Guardian <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 animate-gradient-x pb-2">
                  for AI Agents.
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-white max-w-3xl mx-auto font-extrabold leading-relaxed pt-6">
                Cut hallucination rates & logic errors in half. Instantly.
                <br />
                <span className="text-slate-300 font-bold">
                  We don&apos;t build the Agent. We{" "}
                  <span className="text-emerald-400 font-bold">cure</span> it.
                </span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              {isLoggedIn ? (
                <Link href="/organizations">
                  <Button className="h-14 px-10 text-lg !font-extrabold rounded-full bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_50px_-10px_rgba(16,185,129,0.5)] hover:shadow-[0_0_70px_-10px_rgba(16,185,129,0.7)] transition-all hover:scale-[1.02]">
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              ) : (
                <Link href="/login?mode=signup&intent=trial">
                  <Button className="h-14 px-10 text-lg !font-extrabold rounded-full bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_50px_-10px_rgba(16,185,129,0.5)] hover:shadow-[0_0_70px_-10px_rgba(16,185,129,0.7)] transition-all hover:scale-[1.02]">
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              )}
              <a href="#problem">
                <Button
                  variant="outline"
                  className="h-14 px-10 text-lg !font-bold rounded-full border-white/20 hover:border-white/40 text-white hover:bg-white/5 transition-all"
                >
                  See Details
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Stats Bar */}
      <section className="py-16 border-y border-white/5 bg-[#030303] relative z-10">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 text-center">
            <div className="space-y-2">
              <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest">
                Agents Protected
              </p>
              <p className="text-5xl md:text-6xl font-black text-white tracking-tight">2.4K+</p>
            </div>
            <div className="space-y-2">
              <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest">
                Traces Analyzed
              </p>
              <p className="text-5xl md:text-6xl font-black text-white tracking-tight">1.2M+</p>
            </div>
            <div className="space-y-2">
              <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest">
                Regressions Caught
              </p>
              <p className="text-5xl md:text-6xl font-black text-white tracking-tight">18K+</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The Pathology (Problem) */}
      <div className="relative z-10">
        <PathologySection />
      </div>

      {/* 4.5. Atomic Signals (Periodic Table) */}
      <div className="relative z-10">
        <AtomicSignalsSection />
      </div>

      {/* 5. The Treatment (Solution/Workflow) */}
      <div className="relative z-10">
        <TreatmentSection />
      </div>

      {/* 6. Pricing Section */}
      <div className="relative z-10">
        <PricingSection />
      </div>

      {/* 7. CTA Footer */}
      <footer className="py-48 border-t border-white/5 relative overflow-hidden text-center bg-[#08080a]/90 backdrop-blur-md z-10">
        {/* ====== Vector Shapes & Curtain Lights (Figma Match) ====== */}
        {/* Left Side Vector Capsules */}
        <div className="absolute top-[10%] -left-[100px] md:-left-[80px] w-[180px] md:w-[220px] h-[400px] md:h-[500px] border-[6px] md:border-[10px] border-cyan-500 rounded-r-full opacity-80 pointer-events-none shadow-[0_0_40px_rgba(6,182,212,0.3)]" />
        <div className="absolute bottom-[10%] -left-[100px] md:-left-[80px] w-[180px] md:w-[220px] h-[200px] md:h-[250px] border-[6px] md:border-[10px] border-white rounded-r-full opacity-90 pointer-events-none shadow-[0_0_30px_rgba(255,255,255,0.4)]" />

        {/* Right Side Vector Arc */}
        <div className="absolute top-[-30%] -right-[300px] md:-right-[250px] w-[600px] md:w-[800px] h-[800px] md:h-[1100px] border-[6px] md:border-[10px] border-emerald-500 rounded-l-full opacity-60 pointer-events-none shadow-[0_0_60px_rgba(16,185,129,0.2)]" />

        {/* Diagonal Curtain Lights */}
        <div className="absolute top-[-40%] right-[-20%] w-[150%] h-[400px] bg-gradient-to-r from-transparent via-cyan-900/40 to-transparent -rotate-[35deg] blur-[80px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[-10%] right-[-10%] w-[150%] h-[200px] bg-gradient-to-r from-transparent via-emerald-900/30 to-transparent -rotate-[35deg] blur-[60px] pointer-events-none mix-blend-screen" />
        <div className="absolute top-[20%] right-[-30%] w-[120%] h-[150px] bg-gradient-to-r from-transparent via-white/5 to-transparent -rotate-[35deg] blur-[40px] pointer-events-none mix-blend-screen" />

        <div className="absolute -bottom-60 left-1/2 -translate-x-1/2 w-full max-w-5xl h-96 bg-emerald-500/10 blur-[150px] rounded-full opacity-50 pointer-events-none" />

        <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 space-y-12 relative z-10">
          <h2 className="text-6xl md:text-[80px] font-bold tracking-tight text-white leading-[0.9]">
            Stop praying, <br /> start testing.
          </h2>
          <p className="text-xl text-slate-400 max-w-xl mx-auto leading-relaxed">
            Join the elite engineering teams using PluvianAI to build safe, scalable, and
            predictable AI agents.
          </p>
          <div className="pt-8 flex flex-col sm:flex-row gap-6 justify-center">
            {isLoggedIn ? (
              <Link href="/organizations">
                <Button className="h-14 px-10 bg-emerald-500 text-black hover:bg-emerald-400 rounded-full text-lg font-bold transition-all shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)]">
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            ) : (
              <Link href="/login?mode=signup&intent=free">
                <Button className="h-14 px-10 bg-emerald-500 text-black hover:bg-emerald-400 rounded-full text-lg font-bold transition-all shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)]">
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            )}
          </div>
          <div className="flex items-center justify-center gap-6 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 pt-16">
            <span>No credit card</span>
            <div className="w-1 h-1 bg-slate-800 rounded-full" />
            <span>Instant SDK integration</span>
            <div className="w-1 h-1 bg-slate-800 rounded-full" />
            <span>Interactive Lab</span>
          </div>
        </div>
      </footer>

      {/* 8. Final Credits */}
      <div className="py-12 border-t border-white/5 bg-[#0a0a0c]">
        <div className="w-full max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2.5">
            <Beaker className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-bold tracking-tighter text-white uppercase">
              PluvianAI Atomic Lab
            </span>
          </div>
          <div className="flex gap-10 text-[11px] font-bold text-slate-600 uppercase tracking-widest">
            <a href="#" className="hover:text-emerald-400 transition-colors">
              Documentation
            </a>
            <a href="#" className="hover:text-emerald-400 transition-colors">
              Security
            </a>
            <a href="#" className="hover:text-emerald-400 transition-colors">
              Twitter (X)
            </a>
          </div>
          <div className="text-[11px] text-slate-700 font-bold uppercase tracking-widest">
            © 2026 PluvianAI Inc. Verified.
          </div>
        </div>
      </div>
    </div>
  );
}
