"use client";

import { createContext } from "react";
import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";

export type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";

export const ReleaseGatePageContext = createContext<ReleaseGatePageContextValue | null>(null);
