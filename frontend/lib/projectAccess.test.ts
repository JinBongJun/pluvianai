import { describe, expect, it } from "vitest";

import { getProjectAccessErrorCopy, getProjectPermissionToast, isProjectPermissionError } from "./projectAccess";

const viewerReadOnlyError = {
  response: {
    data: {
      detail: {
        code: "PROJECT_ROLE_READ_ONLY",
        message:
          "Running Release Gate is outside your project permissions. Your current role is 'viewer', which is read-only.",
        details: {
          current_role: "viewer",
          required_roles: ["owner", "admin", "member"],
          access_source: "organization_member",
          org_role: "viewer",
        },
      },
    },
  },
};

describe("projectAccess permission copy", () => {
  it("detects structured project permission errors", () => {
    expect(isProjectPermissionError(viewerReadOnlyError)).toBe(true);
  });

  it("explains viewer write denial as outside-role read-only access", () => {
    const copy = getProjectAccessErrorCopy({
      featureLabel: "Running Release Gate",
      error: viewerReadOnlyError,
    });

    expect(copy.title).toContain("Outside Your Role");
    expect(copy.description).toContain("Viewer");
    expect(copy.description).toContain("read-only");
    expect(copy.description).toContain("cannot change or run this action");
  });

  it("returns warning toast copy for project permission denials", () => {
    expect(
      getProjectPermissionToast({
        featureLabel: "Running Release Gate",
        error: viewerReadOnlyError,
      })
    ).toEqual({
      message:
        "Your current role is Viewer. Running Release Gate is read-only for your role, so you can review project data but cannot change or run this action. Ask a project owner or another project admin if you need edit access.",
      tone: "warning",
    });
  });
});
