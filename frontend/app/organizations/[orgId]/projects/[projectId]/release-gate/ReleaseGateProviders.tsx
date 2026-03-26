"use client";

import type { ReactNode } from "react";

import { ReleaseGateLayoutWrapper } from "./ReleaseGateLayoutWrapper";
import { ReleaseGateKeysContext } from "./ReleaseGateKeysContext";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";
import {
  ReleaseGateValidateRunContext,
  type ReleaseGateValidateRunContextValue,
} from "./ReleaseGateValidateRunContext";

export type ReleaseGateProvidersProps = {
  readonly validateRun: ReleaseGateValidateRunContextValue;
  readonly keys: {
    keyBlocked: boolean;
    keyIssueBlocked: boolean;
    keyRegistrationMessage: string;
    missingProviderKeyDetails: string[];
  };
  readonly page: ReleaseGatePageContextValue;
  readonly layout: {
    orgId: string;
    projectId: number;
    projectName?: string;
    orgName?: string;
    onAction: (actionId: string) => void;
  };
  readonly children: ReactNode;
};

/** Nested Release Gate contexts + {@link ReleaseGateLayoutWrapper}. */
export function ReleaseGateProviders({
  validateRun,
  keys,
  page,
  layout,
  children,
}: ReleaseGateProvidersProps) {
  return (
    <ReleaseGateValidateRunContext.Provider value={validateRun}>
      <ReleaseGateKeysContext.Provider value={keys}>
        <ReleaseGatePageContext.Provider value={page}>
          <ReleaseGateLayoutWrapper
            orgId={layout.orgId}
            projectId={layout.projectId}
            projectName={layout.projectName}
            orgName={layout.orgName}
            onAction={layout.onAction}
          >
            {children}
          </ReleaseGateLayoutWrapper>
        </ReleaseGatePageContext.Provider>
      </ReleaseGateKeysContext.Provider>
    </ReleaseGateValidateRunContext.Provider>
  );
}
