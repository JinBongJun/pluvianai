"use client";

import type { ReactNode } from "react";
import { ReactFlowProvider } from "reactflow";

import DrawIOEdge from "@/components/shared/DrawIOEdge";

import { AgentCardNode } from "./AgentCardNode";

/** Stable registry for React Flow (avoid passing a new `nodeTypes` object each render). */
export const LIVE_VIEW_NODE_TYPES = { agentCard: AgentCardNode };

export const LIVE_VIEW_EDGE_TYPES = { default: DrawIOEdge };

export function LiveViewFlowShell({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}
