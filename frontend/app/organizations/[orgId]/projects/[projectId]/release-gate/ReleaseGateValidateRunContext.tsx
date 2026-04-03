"use client";

import { createContext } from "react";
import type { ReleaseGateResult } from "@/lib/api";
import type { CompletedReleaseGateResultEntry } from "./useReleaseGateValidateRun";

/** Validate / async job UI — split from main page context so frequent form edits do not refresh this slice. */
export type ReleaseGateValidateRunContextValue = {
  isValidating: boolean;
  runLocked: boolean;
  activeJobId: string | null;
  cancelRequested: boolean;
  cancelLocked: boolean;
  handleValidate: () => void;
  handleCancelActiveJob: (() => void) | undefined;
  error: string;
  result: ReleaseGateResult | null;
  completedResults: CompletedReleaseGateResultEntry[];
  hasCompletedResults: boolean;
  dismissResult: (reportId: string) => void;
  removeCompletedResult: (reportId: string) => void;
};

export const ReleaseGateValidateRunContext = createContext<ReleaseGateValidateRunContextValue | null>(
  null
);
