import type { ReleaseGateConfigPanelContextSlice } from "./releaseGateConfigPanelContextPick";
import type {
  ReleaseGateConfigPanelModel,
  ReleaseGateConfigPanelShellSlice,
} from "./releaseGateConfigPanelModel.types";
import type { ReleaseGateConfigPanelCoreTabModel } from "./useReleaseGateConfigPanelCoreTabModel";
import type { ReleaseGateConfigPanelParityTabModel } from "./useReleaseGateConfigPanelParityTabModel";
import type { ReleaseGateConfigPanelPreviewTabModel } from "./useReleaseGateConfigPanelPreviewTabModel";
import { logger } from "@/lib/logger";

function warnDuplicateMergeKeys(
  layers: ReadonlyArray<readonly [string, Record<string, unknown>]>
) {
  const seen = new Set<string>();
  for (const [label, obj] of layers) {
    for (const k of Object.keys(obj)) {
      if (seen.has(k) && process.env.NODE_ENV === "development") {
        logger.warn(
          `[ReleaseGateConfigPanel] duplicate merge key "${k}" (layer "${label}" overlaps a prior layer)`
        );
      }
      seen.add(k);
    }
  }
}

/**
 * Assembles the flat panel model. In development, logs if two layers define the same property
 * (last spread would win silently).
 */
export function mergeReleaseGateConfigPanelModel(input: {
  c: ReleaseGateConfigPanelContextSlice;
  core: ReleaseGateConfigPanelCoreTabModel;
  parity: ReleaseGateConfigPanelParityTabModel;
  preview: ReleaseGateConfigPanelPreviewTabModel;
  editsLocked: boolean;
  shell: Pick<
    ReleaseGateConfigPanelShellSlice,
    | "showRawBaseline"
    | "setShowRawBaseline"
    | "configTab"
    | "setConfigTab"
    | "showExpandedCandidatePreview"
    | "setShowExpandedCandidatePreview"
  >;
}): ReleaseGateConfigPanelModel {
  const { c, core, parity, preview, editsLocked, shell } = input;

  if (process.env.NODE_ENV !== "production") {
    warnDuplicateMergeKeys([
      ["c", c as Record<string, unknown>],
      ["core", core as Record<string, unknown>],
      ["parity", parity as Record<string, unknown>],
      ["preview", preview as Record<string, unknown>],
      ["shell", { editsLocked, ...shell } as Record<string, unknown>],
    ]);
  }

  return {
    ...c,
    editsLocked,
    ...core,
    ...parity,
    ...preview,
    ...shell,
  };
}
