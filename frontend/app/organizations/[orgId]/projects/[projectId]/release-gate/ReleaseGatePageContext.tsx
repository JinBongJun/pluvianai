"use client";

import { createContext } from "react";

export const ReleaseGatePageContext = createContext<Record<string, unknown> | null>(null);
