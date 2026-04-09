"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthSession } from "@/hooks/useAuthSession";

type NavActive = "home" | "docs" | "blog";

interface MarketingNavbarProps {
  active?: NavActive;
}

export default function MarketingNavbar({ active = "home" }: MarketingNavbarProps) {
  const { isAuthenticated: isLoggedIn } = useAuthSession();

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#030303]/80 backdrop-blur-xl">
      <div className="w-full px-6 md:px-12 lg:px-16 h-[90px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 group">
          <div className="relative w-14 h-14 pointer-events-none select-none group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]"
            >
              <path
                d="M20 50 C 20 20, 80 20, 80 50 L 80 80 L 20 80 Z"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="4"
                className="animate-pulse"
              />
              <circle cx="40" cy="45" r="5" fill="#10b981" />
              <path d="M60 60 L 90 40" stroke="#10b981" strokeWidth="2.5" />
            </svg>
          </div>
          <span className="text-3xl font-black tracking-tighter text-white uppercase transition-colors group-hover:text-emerald-400">
            PLUVIANAI
          </span>
        </Link>

        <div className="flex items-center gap-8 lg:gap-10">
          <div className="hidden lg:flex items-center gap-8 md:gap-10">
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
              <div className="absolute top-[80px] right-0 w-64 opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 translate-y-2 group-hover/nav:translate-y-0 z-[60]">
                <div className="p-2 rounded-lg bg-[#0a0a0c]/90 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
                  <div className="grid gap-1">
                    <a
                      href="/#problem"
                      className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item"
                    >
                      <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">
                        Problem
                      </span>
                      <span className="text-xs text-slate-500">Silent regressions, no gate</span>
                    </a>
                    <a
                      href="/#features"
                      className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item"
                    >
                      <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">
                        Atomic Signals
                      </span>
                      <span className="text-xs text-slate-500">Rule-based quality checks</span>
                    </a>
                    <a
                      href="/#workflow"
                      className="flex flex-col gap-0.5 p-3 rounded-md hover:bg-white/5 transition-colors group/item"
                    >
                      <span className="text-sm font-bold text-white group-hover/item:text-emerald-400">
                        Workflow
                      </span>
                      <span className="text-xs text-slate-500">Live View → Release Gate</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <a
              href="/#pricing"
              className="text-lg font-extrabold text-slate-400 hover:text-emerald-400 transition-colors"
            >
              Pricing
            </a>
            <Link
              href="/blog"
              className={`text-lg font-extrabold transition-colors ${
                active === "blog"
                  ? "text-emerald-400 underline underline-offset-4"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              Laboratory
            </Link>
            <Link
              href="/docs"
              className={`text-lg font-extrabold transition-colors ${
                active === "docs"
                  ? "text-emerald-400 underline underline-offset-4"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              Docs
            </Link>
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
              <div className="hidden md:flex items-center gap-6 text-lg font-extrabold">
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
  );
}
