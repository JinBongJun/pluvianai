"use client";

import { useMemo, useState } from "react";
import { analytics } from "@/lib/analytics";

function makeLongText(length: number): string {
  return "x".repeat(length);
}

export default function AnalyticsSanitizationProbePage() {
  const [sent, setSent] = useState(false);

  const payload = useMemo(
    () => ({
      email: "sensitive.user@example.com",
      password: "super-secret-password",
      api_key: "sk-live-secret-1234",
      access_token: "token-abc-123",
      nested: {
        secret: "nested-secret-value",
      },
      contact: "another.user@example.com",
      long_text: makeLongText(280),
      items: Array.from({ length: 25 }, (_, i) => `item-${i + 1}`),
    }),
    []
  );

  const handleSendProbe = () => {
    analytics.capture("qa_analytics_sanitization_probe", payload);
    setSent(true);
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-100">
      <h1 className="text-2xl font-bold">Analytics Sanitization Probe</h1>
      <p className="mt-3 text-sm text-slate-300">
        This page emits a single analytics event with sensitive fields for QA verification.
      </p>

      <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5">
        <button
          type="button"
          data-testid="analytics-sanitization-send"
          onClick={handleSendProbe}
          className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500"
        >
          Send Probe Event
        </button>
        <div className="mt-3 text-xs text-slate-400" data-testid="analytics-sanitization-status">
          {sent ? "Probe sent." : "Not sent yet."}
        </div>
      </div>
    </main>
  );
}
