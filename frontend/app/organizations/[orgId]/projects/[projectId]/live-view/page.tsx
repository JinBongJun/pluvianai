"use client";

import { LiveViewFlowShell } from "@/components/live-view/LiveViewFlowShell";

import { LiveViewContent } from "./LiveViewContent";

export default function LiveViewPage() {
  return (
    <LiveViewFlowShell>
      <LiveViewContent />
    </LiveViewFlowShell>
  );
}
