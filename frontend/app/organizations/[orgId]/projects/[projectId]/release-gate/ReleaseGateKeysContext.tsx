"use client";

import { createContext } from "react";

export type ReleaseGateKeysContextValue = {
  keyBlocked: boolean;
  keyRegistrationMessage: string;
};

export const ReleaseGateKeysContext = createContext<ReleaseGateKeysContextValue | null>(null);
