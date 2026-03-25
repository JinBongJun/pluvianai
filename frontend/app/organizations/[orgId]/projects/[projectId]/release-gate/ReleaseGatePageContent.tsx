"use client";

import { ReleaseGateProviders } from "./ReleaseGateProviders";
import { ReleaseGatePlanLimitedLayout } from "./releaseGatePlanLimitedLayout";
import { useReleaseGatePageModel } from "./useReleaseGatePageModel";

export { sanitizePayloadForPreview } from "./releaseGatePageContent.lib";

/**
 * Release Gate route shell: delegates orchestration to {@link useReleaseGatePageModel}.
 */
export default function ReleaseGatePageContent() {
  const m = useReleaseGatePageModel();

  return (
    <ReleaseGateProviders
      validateRun={m.validateRunContextValue}
      keys={m.releaseGateKeysContextValue}
      page={m.contextValue}
      layout={m.layout}
    >
      <ReleaseGatePlanLimitedLayout planError={m.planError} gateBodyProps={m.gateBodyProps} />
    </ReleaseGateProviders>
  );
}
