import { describe, expect, it } from "vitest";

import {
  buildCanonicalProjectPath,
  getProjectScopeMismatchOrgId,
} from "@/lib/projectRouteScope";

describe("projectRouteScope", () => {
  it("rewrites the org segment while preserving the project subpath and query string", () => {
    expect(
      buildCanonicalProjectPath(
        "/organizations/33/projects/5/release-gate",
        "33",
        44,
        5,
        "?tab=history"
      )
    ).toBe("/organizations/44/projects/5/release-gate?tab=history");
  });

  it("extracts the canonical org id from a scope mismatch error payload", () => {
    const error = {
      response: {
        data: {
          detail: {
            code: "PROJECT_ORG_SCOPE_MISMATCH",
            details: {
              actual_organization_id: 91,
            },
          },
        },
      },
    };

    expect(getProjectScopeMismatchOrgId(error)).toBe(91);
    expect(getProjectScopeMismatchOrgId({})).toBeNull();
  });
});
