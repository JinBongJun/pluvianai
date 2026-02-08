'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Shield, Crown } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const tiers = [
    {
        name: 'Community',
        price: '0',
        description: 'For independent researchers and hobbyists.',
        features: [
            'Up to 3 Active Agents',
            'Basic Signal Monitoring',
            'Community Support',
            '7-Day Trace Retention'
        ],
        icon: Zap,
        color: 'text-slate-400',
        buttonVariant: 'outline' as const
    },
    {
        name: 'Pro',
        price: '49',
        description: 'For professional developers and production agents.',
        features: [
            'Unlimited Active Agents',
            'Full 13 Atomic Signals',
            'Real-time Logic Guardrails',
            'Priority Support',
            '30-Day Trace Retention',
            'API Access'
        ],
        icon: Shield,
        color: 'text-emerald-400',
        bestValue: true,
        buttonVariant: 'primary' as const
    },
    {
        name: 'Enterprise',
        price: 'Custom',
        description: 'For clinical organizations with strict security needs.',
        features: [
            'White-glove Integration',
            'Self-hosted Options',
            'SOC2 / HIPAA Compliance',
            'Infinite Trace Retention',
            'Custom Signal Engineering',
            'Dedicated Lab Support'
        ],
        icon: Crown,
        color: 'text-cyan-400',
        buttonVariant: 'outline' as const
    }
];

export default function PricingSection() {
    return (
        <section id="pricing" className="py-32 relative overflow-hidden">
            <div className="container mx-auto px-6 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-20">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6 border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Access
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
                        Clinical Grade Pricing.
                    </h2>
                    <p className="text-xl text-slate-400 leading-relaxed font-medium">
                        Start for free, scale as your agents grow smarter. <br />
                        No hidden fees, just precision validation.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
                    {tiers.map((tier) => (
                        <motion.div
                            key={tier.name}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            whileHover={{ y: -10 }}
                            className={`relative p-8 rounded-xl bg-[#0d0d11]/80 backdrop-blur-xl border ${tier.bestValue ? 'border-emerald-500/50 shadow-[0_0_50px_-10px_rgba(16,185,129,0.2)]' : 'border-white/5'} flex flex-col`}
                        >
                            {tier.bestValue && (
                                <div className="absolute top-0 right-8 -translate-y-1/2 px-4 py-1 bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest rounded-full">
                                    Best Value
                                </div>
                            )}

                            <div className="mb-8">
                                <div className={`w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 ${tier.color} border border-white/10`}>
                                    <tier.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-2xl font-black text-white mb-2">{tier.name}</h3>
                                <div className="flex items-baseline gap-1 mb-4">
                                    <span className="text-4xl font-black text-white">
                                        {tier.price !== 'Custom' && '$'}{tier.price}
                                    </span>
                                    {tier.price !== 'Custom' && <span className="text-slate-500 font-bold uppercase tracking-widest text-xs">/ month</span>}
                                </div>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    {tier.description}
                                </p>
                            </div>

                            <div className="space-y-4 mb-10 flex-grow">
                                {tier.features.map((feature) => (
                                    <div key={feature} className="flex items-start gap-3">
                                        <div className="mt-1 flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                                        </div>
                                        <span className="text-sm text-slate-300 font-medium">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <Button
                                variant={tier.buttonVariant}
                                className={`w-full h-12 text-sm font-black uppercase tracking-widest ${tier.bestValue ? 'shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)]' : ''}`}
                            >
                                {tier.price === 'Custom' ? 'Contact Clinical Support' : 'Select Plan'}
                            </Button>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-20 text-center">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em]">
                        Trusted by 10,000+ clinical engineers worldwide
                    </p>
                </div>
            </div>

            {/* Background Accent */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />
        </section>
    );
}
