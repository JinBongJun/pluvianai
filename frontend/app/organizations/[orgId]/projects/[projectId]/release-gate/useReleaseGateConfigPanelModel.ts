"use client";

import { useContext, useEffect, useState } from "react";

import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { ReleaseGateValidateRunContext } from "./ReleaseGateValidateRunContext";
import { mergeReleaseGateConfigPanelModel } from "./releaseGateConfigPanelModelMerge";
import { pickReleaseGateConfigPanelContext } from "./releaseGateConfigPanelContextPick";
import type { ReleaseGateConfigModalTab, ReleaseGateConfigThresholdPreset } from "./releaseGateConfigPanelTypes";
import type { ReleaseGateConfigPanelModel } from "./releaseGateConfigPanelModel.types";
import { useReleaseGateConfigPanelBaselineToolTimeline } from "./useReleaseGateConfigPanelBaselineToolTimeline";
import { useReleaseGateConfigPanelCoreTabModel } from "./useReleaseGateConfigPanelCoreTabModel";
import { useReleaseGateConfigPanelParityTabModel } from "./useReleaseGateConfigPanelParityTabModel";
import { useReleaseGateConfigPanelPreviewTabModel } from "./useReleaseGateConfigPanelPreviewTabModel";

export type { ReleaseGateConfigModalTab, ReleaseGateConfigThresholdPreset } from "./releaseGateConfigPanelTypes";
export type {
  ReleaseGateConfigPanelBaselineColumnProps,
  ReleaseGateConfigPanelCoreTabProps,
  ReleaseGateConfigPanelModel,
  ReleaseGateConfigPanelParityTabProps,
  ReleaseGateConfigPanelPreviewTabProps,
} from "./releaseGateConfigPanelModel.types";

/**
 * Compose order: context pick → baseline tool timeline (SWR) → Core tab model → Parity (timeline + Core flags) → Preview (`configTab === "preview"` enables heavy candidate parity memos) → merge.
 */
export function useReleaseGateConfigPanelModel(isOpen: boolean): ReleaseGateConfigPanelModel {
  const ctx = useContext(ReleaseGatePageContext)!;
  const vctx = useContext(ReleaseGateValidateRunContext)!;

  const c = pickReleaseGateConfigPanelContext(ctx, vctx);
  const editsLocked = c.runLocked;

  const [showRawBaseline, setShowRawBaseline] = useState(false);
  const [configTab, setConfigTab] = useState<ReleaseGateConfigModalTab>("core");
  const [showExpandedCandidatePreview, setShowExpandedCandidatePreview] = useState(false);

  useEffect(() => {
    if (isOpen) setConfigTab("core");
  }, [isOpen]);

  const timeline = useReleaseGateConfigPanelBaselineToolTimeline(isOpen, c);
  const core = useReleaseGateConfigPanelCoreTabModel(isOpen, c, editsLocked);
  const parity = useReleaseGateConfigPanelParityTabModel(
    c,
    editsLocked,
    core.isJsonModified,
    core.isSystemPromptOverridden,
    timeline
  );
  const preview = useReleaseGateConfigPanelPreviewTabModel(c, configTab === "preview");

  return mergeReleaseGateConfigPanelModel({
    c,
    core,
    parity,
    preview,
    editsLocked,
    shell: {
      showRawBaseline,
      setShowRawBaseline,
      configTab,
      setConfigTab,
      showExpandedCandidatePreview,
      setShowExpandedCandidatePreview,
    },
  });
}
