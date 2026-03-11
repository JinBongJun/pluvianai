"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
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
import MarketingNavbar from "@/components/layout/MarketingNavbar";

export default function Home() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  return (
    <div className="min-h-screen text-slate-200 selection:bg-emerald-500/30 font-sans relative">
      {/* Global Antigravity Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#030303]">
        {/* Deep space radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#101018,transparent_50%)] opacity-50" />

        {/* Starry Dust Layer 1 (Dense & Small) */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjE1KSIvPjxjaXJjbGUgY3g9IjE4MCIgY3k9IjEyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PGNpcmNsZSBjeD0iMzIwIiBjeT0iODAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjMyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjI1KSIvPjxjaXJjbGUgY3g9IjkwIiBjeT0iMjgwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMTUpIi8+PGNpcmNsZSBjeD0iMzcwIiBjeT0iMjIwIiByPSIxIiBmaWxsPSJyZ2JhLDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] bg-[size:300px_300px] opacity-60" />

        {/* Starry Dust Layer 2 (Sparse & Bright) */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJub25lIi8+PGNpcmNsZSBjeD0iMTUwIiBjeT0iMTUwIiByPSIyIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMykiLz48Y2lyY2xlIGN4PSI2NTAiIGN5PSI0NTAiIHI9IjEuNSIgZmlsbD0icmdiYSg2LDE4MiwyMTIsMC41KSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjY1MCIgcj0iMiIgZmlsbD0icmdiYSgxNiwxODUsMTI5LDAuNCkiLz48Y2lyY2xlIGN4PSI1NTAiIGN5PSIyNTAiIHI9IjIuNSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PC9zdmc+')] bg-[size:800px_800px] opacity-80" />

        {/* Photographic Light Leaks & Lens Flares */}
        <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[10%] w-[600px] h-[600px] bg-emerald-900/20 blur-[150px] rounded-full pointer-events-none mix-blend-screen" />

        {/* Anamorphic Flare Line */}
        <div className="absolute top-[40%] left-[-10%] w-[120%] h-[2px] bg-cyan-500/30 blur-[2px] -rotate-12 pointer-events-none mix-blend-screen" />
        <div className="absolute top-[40%] left-[-10%] w-[120%] h-[20px] bg-cyan-500/10 blur-[20px] -rotate-12 pointer-events-none mix-blend-screen" />

        {/* Floating Particles (Photographic depth) */}
        <div className="absolute top-[15%] left-[15%] w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.8)] opacity-80" />
        <div className="absolute top-[30%] left-[20%] w-3 h-3 rounded-full bg-emerald-300 blur-[1px] shadow-[0_0_15px_3px_rgba(16,185,129,0.6)] opacity-60" />
        <div className="absolute top-[20%] right-[18%] w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_2px_rgba(6,182,212,0.8)] opacity-90" />
        <div className="absolute bottom-[25%] left-[25%] w-2.5 h-2.5 rounded-full bg-cyan-300 blur-[1px] shadow-[0_0_12px_2px_rgba(6,182,212,0.8)] opacity-70" />
        <div className="absolute bottom-[35%] right-[15%] w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.8)] opacity-80" />
      </div>

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
      <MarketingNavbar active="home" />

      {/* 2. Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-40 pb-20 overflow-hidden bg-transparent z-10 transition-all duration-700">
        {/* ====== Flashy Geometric Light Beams Background ====== */}

        {/* -- LEFT BEAM (Cyan/Emerald) -- */}
        <div
          className="absolute top-1/2 -left-[40%] md:-left-[25%] w-[60%] md:w-[45%] h-[160%] -translate-y-1/2 rounded-[100%] pointer-events-none -z-10
                    border-r-[4px] border-cyan-400 
                    bg-gradient-to-l from-cyan-500/40 via-emerald-900/10 to-transparent 
                    shadow-[inset_-40px_0_120px_rgba(34,211,238,0.4),_10px_0_60px_rgba(16,185,129,0.3)] 
                    opacity-90 transform-gpu rotate-[-8deg] md:rotate-[-6deg]"
        />

        {/* -- RIGHT BEAM (Emerald/Cyan) -- */}
        <div
          className="absolute top-1/2 -right-[40%] md:-right-[25%] w-[60%] md:w-[45%] h-[160%] -translate-y-1/2 rounded-[100%] pointer-events-none -z-10
                    border-l-[4px] border-emerald-400 
                    bg-gradient-to-r from-emerald-500/40 via-cyan-900/10 to-transparent 
                    shadow-[inset_40px_0_120px_rgba(16,185,129,0.4),_-10px_0_60px_rgba(34,211,238,0.3)] 
                    opacity-90 transform-gpu rotate-[8deg] md:rotate-[6deg]"
        />

        {/* -- BOTTOM FLARE -- */}
        <div
          className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[80%] h-[40%] pointer-events-none -z-10
                    bg-gradient-to-t from-cyan-950/60 via-emerald-900/20 to-transparent 
                    blur-[80px] rounded-full mix-blend-screen"
        />

        {/* Center vignette to push focus to text */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,transparent_30%,#030303_100%)] pointer-events-none -z-10 opacity-70" />

        <div className="w-full max-w-[1400px] mx-auto px-6 relative z-10 text-center flex flex-col items-center">
          <div className="max-w-6xl mx-auto space-y-10">
            {/* Headline - Brand Promise First */}
            <div className="space-y-4">
              <h1 className="text-7xl md:text-[90px] font-extrabold tracking-tight text-white leading-[1.0] drop-shadow-2xl">
                Build confidence. <br />
                <span className="text-emerald-500">Before you deploy.</span>
              </h1>
              <p className="text-xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed pt-6">
                Replay real production traces, compare behavior diffs, and enforce a strict
                pass/fail Release Gate so you ship only what’s safe.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center justify-center pt-10">
              {isLoggedIn ? (
                <Link href="/organizations">
                  <Button className="h-16 px-12 text-xl !font-extrabold rounded-full bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_60px_-10px_rgba(16,185,129,0.55)] hover:shadow-[0_0_80px_-10px_rgba(16,185,129,0.75)] transition-all hover:scale-[1.03]">
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              ) : (
                <Link href="/login?mode=signup&intent=trial">
                  <Button className="h-16 px-12 text-xl !font-extrabold rounded-full bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_60px_-10px_rgba(16,185,129,0.55)] hover:shadow-[0_0_80px_-10px_rgba(16,185,129,0.75)] transition-all hover:scale-[1.03]">
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. The Pathology (Problem) */}
      <div className="relative z-10">
        <PathologySection />
      </div>

      {/* 4.5. Atomic Signals */}
      <div className="relative z-10">
        <AtomicSignalsSection />
      </div>

      {/* 5. The Treatment (Solution/Workflow) */}
      <div className="relative z-10">
        <TreatmentSection />
      </div>

      {/* 6. Pricing Section */}
      <div className="relative z-10">
        <PricingSection isLoggedIn={isLoggedIn} />
      </div>

      {/* 7. CTA Footer */}
      <footer className="py-48 border-t border-white/5 relative overflow-hidden text-center bg-transparent z-10">
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

        {/* Emerald Glow behind the glass box */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-emerald-500/20 blur-[120px] rounded-full pointer-events-none" />
        {/* Diagonal grid lines specific to this section to match the Figma reference */}
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.03)_50%,transparent_75%)] bg-[length:60px_60px] pointer-events-none -z-10" />

        <div className="w-full max-w-5xl mx-auto px-6 md:px-12 relative z-10">
          <div className="rounded-[40px] border border-white/10 bg-white/[0.02] backdrop-blur-2xl py-24 px-8 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
            <h2 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 relative z-10">
              Ready to PluvianAI?
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12 relative z-10">
              Don&apos;t be afraid anymore, and distribute with confidence!
            </p>
            <div className="flex justify-center relative z-10">
              {isLoggedIn ? (
                <Link href="/organizations">
                  <Button className="h-14 px-8 bg-emerald-500 text-black hover:bg-emerald-400 rounded-full text-lg font-bold transition-all shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)]">
                    Get Started
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              ) : (
                <Link href="/login?mode=signup&intent=free">
                  <Button className="h-14 px-8 bg-emerald-500 text-black hover:bg-emerald-400 rounded-full text-lg font-bold transition-all shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)]">
                    Get Started
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* 8. Final Credits */}
      <div className="py-20 border-t border-white/5 bg-black/50 text-slate-400">
        <div className="w-full max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-4 gap-12 text-sm">
          <div className="col-span-1 md:col-span-1 space-y-4">
            <h3 className="text-xl font-bold text-white mb-6">About Us</h3>
            <p className="leading-relaxed text-slate-500">
              We&apos;re a team of designers, engineers, and innovators building AI tools that
              empower anyone to turn imagination into stunning visuals—faster, smarter, and
              effortlessly.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-emerald-500 mb-6">Useful Links</h4>
            <ul className="space-y-4">
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  About
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Services
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Team
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Prices
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-emerald-500 mb-6">Help</h4>
            <ul className="space-y-4">
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Customer Support
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Terms & Conditions
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-emerald-500 mb-6">Connect With Us</h4>
            <ul className="space-y-4 text-slate-500">
              <li>
                27 Division St, New York,
                <br />
                NY 10002, USA
              </li>
              <li className="pt-2">+123 324 2653</li>
              <li>username@mail.com</li>
            </ul>
          </div>
        </div>

        {/* Massive Brand Text (CodeRabbit Style) */}
        <div className="w-full overflow-hidden flex justify-center mt-12 md:mt-24 select-none pointer-events-none relative z-10">
          <h2
            className="text-[17vw] font-black tracking-tighter uppercase whitespace-nowrap text-transparent leading-none"
            style={{
              WebkitTextStroke: "1px rgba(16, 185, 129, 0.6)",
              maskImage: "linear-gradient(to bottom, black 20%, transparent 90%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 20%, transparent 90%)",
            }}
          >
            PLUVIANAI
          </h2>
        </div>

        <div className="w-full max-w-7xl mx-auto px-6 md:px-12 mt-[-20px] md:mt-[-40px] pt-8 border-t border-emerald-500/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 relative z-20">
          <div>© 2026 All Right Reserved.</div>
        </div>
      </div>
    </div>
  );
}
