"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Send, Image as ImageIcon } from "lucide-react";
import apiClient from "@/lib/api";
import { useToast } from "@/components/ToastContainer";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MIN_MESSAGE_LENGTH = 6;

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  const [evidence, setEvidence] = useState("");
  const [showEvidenceField, setShowEvidenceField] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = feedback.trim();

    if (!message || isSubmitting) return;

    if (message.length < MIN_MESSAGE_LENGTH) {
      const warning = "Please write at least 6 characters so we can understand your feedback.";
      setError(warning);
      showToast(warning, "warning");
      return;
    }

    const evidenceText = evidence.trim();
    const fullMessage = evidenceText ? `${message}\n\n[Evidence]\n${evidenceText}` : message;

    try {
      setIsSubmitting(true);
      const page =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search || ""}`
          : undefined;

      if (evidenceFile) {
        const formData = new FormData();
        formData.append("message", fullMessage);
        if (page) {
          formData.append("page", page);
        }
        formData.append("evidence", evidenceFile);
        await apiClient.post("/feedback/with-attachment", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await apiClient.post("/feedback", {
          message: fullMessage,
          page,
        });
      }
      setFeedback("");
      setEvidence("");
      setEvidenceFile(null);
      setError(null);
      showToast("Feedback sent. Thank you for helping us improve PluvianAI.", "success");
      onClose();
    } catch (err) {
      console.error("Failed to submit feedback", err);
      showToast("Failed to send feedback. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedbackChange = (value: string) => {
    setFeedback(value);
    if (error && value.trim().length >= MIN_MESSAGE_LENGTH) {
      setError(null);
    }
  };

  const handleEvidenceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setEvidenceFile(null);
      return;
    }
    // Light client-side guard; backend enforces the actual limit.
    if (file.size > 5 * 1024 * 1024) {
      showToast("Evidence file is too large. Please attach a file under 5MB.", "warning");
      setEvidenceFile(null);
      event.target.value = "";
      return;
    }
    setEvidenceFile(file);
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
                <div className="space-y-3">
                  <textarea
                    autoFocus
                    value={feedback}
                    onChange={e => handleFeedbackChange(e.target.value)}
                    placeholder="My idea for improving PluvianAI is..."
                    className="w-full h-64 p-8 bg-white/[0.02] border border-white/10 rounded-[32px] text-white placeholder-slate-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all resize-none text-xl font-bold shadow-inner"
                  />
                  {error && <p className="text-sm text-amber-400 font-medium">{error}</p>}
                </div>

                <div className="space-y-4">
                  <button
                    type="button"
                    className="flex items-center gap-3 p-4 hover:bg-white/5 rounded-2xl text-slate-500 hover:text-white transition-all font-black uppercase text-xs tracking-widest"
                    title="Attach evidence (screenshot, links, IDs, or notes)"
                    onClick={() => setShowEvidenceField(prev => !prev)}
                  >
                    <ImageIcon className="w-6 h-6" />
                    <span>Attach Evidence</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-600">
                      Optional
                    </span>
                  </button>

                  {showEvidenceField && (
                    <div className="space-y-2">
                      {/* Screenshot / file evidence */}
                      <div className="flex items-center justify-between gap-4">
                        <label className="inline-flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-white/15 text-xs font-bold uppercase tracking-widest text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleEvidenceFileChange}
                          />
                          <ImageIcon className="w-4 h-4" />
                          <span>Upload Screenshot</span>
                        </label>
                        {evidenceFile && (
                          <div className="flex-1 text-right text-[11px] text-slate-400 truncate">
                            <span className="font-medium text-slate-200">{evidenceFile.name}</span>
                            <span className="ml-2 text-slate-500">
                              {(evidenceFile.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Text / link evidence */}
                      <textarea
                        value={evidence}
                        onChange={e => setEvidence(e.target.value)}
                        placeholder="Paste links, run IDs, or short notes that help us reproduce the issue."
                        className="w-full h-28 p-4 bg-white/[0.02] border border-dashed border-white/15 rounded-2xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all resize-none"
                      />
                      <p className="text-[11px] text-slate-500">
                        Evidence text is appended to your message and any screenshot is attached
                        securely to the feedback email.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end pt-6 border-t border-white/5">
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
