"use client";

import { createContext } from "react";

export type ReleaseGateKeysContextValue = {
  keyBlocked: boolean;
  /** True when API key requirements are not met (or still loading), regardless of baseline/run selection. */
  keyIssueBlocked: boolean;
  keyRegistrationMessage: string;
  missingProviderKeyDetails: string[];
};

export const ReleaseGateKeysContext = createContext<ReleaseGateKeysContextValue | null>(null);
