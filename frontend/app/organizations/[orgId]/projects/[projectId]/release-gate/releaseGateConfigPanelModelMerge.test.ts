import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

import { mergeReleaseGateConfigPanelModel } from "./releaseGateConfigPanelModelMerge";

describe("mergeReleaseGateConfigPanelModel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("warns in development when two layers share a key", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    mergeReleaseGateConfigPanelModel({
      c: { a: 1, shared: "from-c" } as any,
      core: { shared: "from-core" } as any,
      parity: {} as any,
      preview: {} as any,
      editsLocked: false,
      shell: {
        showRawBaseline: false,
        setShowRawBaseline: () => {},
        configTab: "core",
        setConfigTab: () => {},
        showExpandedCandidatePreview: false,
        setShowExpandedCandidatePreview: () => {},
      },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('duplicate merge key "shared"')
    );
  });
});
