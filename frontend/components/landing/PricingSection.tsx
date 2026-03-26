"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Zap, Shield, Crown, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";

const tiers = [
  {
    name: "Free",
    priceLabel: "Free",
    description: "For teams getting started with Live View and Release Gate.",
    features: [
      "1 organization",
      "2 active projects",
      "10,000 snapshots per month",
      "60 hosted replay credits per month",
    ],
    icon: Zap,
    color: "text-slate-400",
    ctaLabel: "Get started free",
    buttonVariant: "outline" as const,
  },
  {
    name: "Pro",
    priceLabel: "Coming soon",
    description: "For teams that need higher hosted replay budgets and multi-project scale.",
    features: [
      "5 organizations",
      "10 active projects",
      "30,000 snapshots per month",
      "800 hosted replay credits per month",
    ],
    icon: Shield,
    color: "text-emerald-400",
    bestValue: true,
    ctaLabel: "Join waitlist",
    buttonVariant: "primary" as const,
  },
  {
    name: "Enterprise",
    priceLabel: "Contact sales",
    description: "For enterprises that need procurement, security review, and custom limits.",
    features: [
      "Security review & compliance support",
      "Self-hosted / private cloud options",
      "Custom limits, SLAs, and retention",
      "Dedicated PluvianAI support",
    ],
    icon: Crown,
    color: "text-cyan-400",
    ctaLabel: "Contact sales",
    buttonVariant: "outline" as const,
  },
];

type PricingSectionProps = {
  /** Whether the visitor is already authenticated (controls CTA target). */
  isLoggedIn?: boolean;
};

export default function PricingSection({ isLoggedIn }: PricingSectionProps) {
  const primaryHref = isLoggedIn ? "/organizations" : "/login?mode=signup&intent=trial";

  return (
    <section id="pricing" className="py-32 relative bg-transparent overflow-hidden">
      <div className="w-[95%] max-w-[1800px] mx-auto relative z-10 border-t border-white/5 pt-12">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Access
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6">Pricing</h2>
          <p className="text-xl text-slate-400 leading-relaxed font-medium">
            Start for free with product limits and included hosted replay credits. <br />
            Paid plans are preview-only during the MVP.
          </p>
          <p className="text-sm text-slate-500 leading-relaxed font-medium mt-4 max-w-2xl mx-auto">
            All plans include 30-day trace retention.
            <br />
            BYOK runs do not consume hosted replay credits.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 w-full max-w-[1400px] mx-auto">
          {tiers.map(tier => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -10 }}
              className={`relative p-8 rounded-3xl bg-[#0d0d11]/80 backdrop-blur-xl border ${tier.bestValue ? "border-emerald-500/50 shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)] bg-[#0d0d11]/90" : "border-white/5"} flex flex-col`}
            >
              {tier.bestValue && (
                <div className="absolute top-0 right-8 -translate-y-1/2 px-4 py-1 bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest rounded-full">
                  Preview
                </div>
              )}

              <div className="mb-8">
                <div
                  className={`w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 ${tier.color} border border-white/10`}
                >
                  <tier.icon className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-5xl font-black text-white">{tier.priceLabel}</span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{tier.description}</p>
              </div>

              <div className="space-y-4 mb-10 flex-grow">
                {tier.features.map(feature => (
                  <div key={feature} className="flex items-start gap-3">
                    <div className="mt-1 flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                    </div>
                    <span className="text-sm text-slate-300 font-medium">{feature}</span>
                  </div>
                ))}
              </div>

              {tier.name === "Free" ? (
                <Link href={primaryHref} className="w-full">
                  <Button
                    variant={tier.buttonVariant}
                    className={`w-full h-14 text-sm font-black uppercase tracking-widest rounded-full ${tier.bestValue ? "shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)]" : "bg-transparent text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/10"}`}
                  >
                    {tier.ctaLabel}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <Button
                  variant={tier.buttonVariant}
                  disabled={true}
                  className="w-full h-14 text-sm font-black uppercase tracking-widest rounded-full bg-transparent text-slate-500 border border-white/10 opacity-70"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {tier.ctaLabel}
                </Button>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Background Accent (Photographic Flare) */}
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-emerald-500/20 blur-[150px] rounded-full pointer-events-none -z-10 mix-blend-screen" />
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[2px] bg-emerald-400/30 blur-[2px] -rotate-[10deg] pointer-events-none -z-10 mix-blend-screen" />
      <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[20px] bg-emerald-500/10 blur-[20px] -rotate-[10deg] pointer-events-none -z-10 mix-blend-screen" />
    </section>
  );
}
