/**
 * Routing context shared by Live View right-rail panels when an agent is selected.
 * (`agentId` may be empty string when the panel is closed; call sites still gate on selection.)
 */
export type LiveViewPanelRouteContext = {
  readonly projectId: number;
  readonly orgId: string;
  readonly agentId: string;
};
