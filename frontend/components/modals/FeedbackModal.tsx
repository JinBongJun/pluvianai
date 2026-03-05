"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Send, Image as ImageIcon } from "lucide-react";
import apiClient from "@/lib/api";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = feedback.trim();
    if (!message || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await apiClient.post("/feedback", {
        message,
        page:
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search || ""}`
            : undefined,
      });
      setFeedback("");
      onClose();
    } catch (err) {
      console.error("Failed to submit feedback", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            className="relative w-full max-w-2xl bg-[#0d0d0f] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden z-10"
          >
            <div className="p-12">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                      Share your feedback
                    </h2>
                    <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">
                      Help us improve PluvianAI
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-4 hover:bg-white/5 rounded-2xl text-slate-500 hover:text-white transition-colors"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-10">
                <div className="space-y-4">
                  <textarea
                    autoFocus
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="My idea for improving PluvianAI is..."
                    className="w-full h-64 p-8 bg-white/[0.02] border border-white/10 rounded-[32px] text-white placeholder-slate-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all resize-none text-xl font-bold shadow-inner"
                  />
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                  <button
                    type="button"
                    className="flex items-center gap-3 p-4 hover:bg-white/5 rounded-2xl text-slate-500 hover:text-white transition-all font-black uppercase text-xs tracking-widest"
                    title="Attach screenshot"
                  >
                    <ImageIcon className="w-6 h-6" />
                    <span>Attach Evidence</span>
                  </button>

                  <button
                    type="submit"
                    disabled={!feedback.trim() || isSubmitting}
                    className="inline-flex items-center gap-4 px-12 py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black text-xl font-black shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)] transition-all uppercase tracking-widest active:scale-[0.98]"
                  >
                    <Send className="w-6 h-6" />
                    <span>{isSubmitting ? "Sending..." : "Transmit Feedback"}</span>
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
