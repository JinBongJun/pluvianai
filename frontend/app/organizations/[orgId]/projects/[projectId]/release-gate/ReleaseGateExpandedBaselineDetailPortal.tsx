"use client";

import React from "react";
import { AnimatePresence } from "framer-motion";

import {
  SnapshotDetailModal,
  type SnapshotForDetail,
} from "@/components/shared/SnapshotDetailModal";
import { ClientPortal } from "@/components/shared/ClientPortal";

export function ReleaseGateExpandedBaselineDetailPortal({
  baselineDetailSnapshot,
  onClose,
  evalRows,
  evalContextLabel,
}: {
  baselineDetailSnapshot: SnapshotForDetail | null;
  onClose: () => void;
  evalRows: { id: string; status: string }[];
  evalContextLabel: string;
}) {
  return (
    <ClientPortal>
      <AnimatePresence>
        {baselineDetailSnapshot ? (
          <SnapshotDetailModal
            key={String(
              (baselineDetailSnapshot as unknown as { id?: string | number }).id ?? "snapshot"
            )}
            snapshot={baselineDetailSnapshot}
            onClose={onClose}
            overlayZIndex={10000}
            policyState={{ status: "idle" }}
            evalRows={evalRows}
            evalEnabled={true}
            evalContextLabel={evalContextLabel}
          />
        ) : null}
      </AnimatePresence>
    </ClientPortal>
  );
}
