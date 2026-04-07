export function getProjectScopeMismatchOrgId(error: unknown): number | null {
  const actualOrgId = (error as any)?.response?.data?.detail?.details?.actual_organization_id;
  const code = (error as any)?.response?.data?.detail?.code;
  if (code !== "PROJECT_ORG_SCOPE_MISMATCH") {
    return null;
  }
  const parsed = Number(actualOrgId);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildCanonicalProjectPath(
  pathname: string,
  currentOrgId: string,
  actualOrgId: number | string,
  projectId: number,
  search = ""
): string {
  const nextOrgId = String(actualOrgId);
  const projectPrefix = `/organizations/${currentOrgId}/projects/${projectId}`;
  const canonicalPrefix = `/organizations/${nextOrgId}/projects/${projectId}`;

  const normalizedPath = pathname.startsWith(projectPrefix)
    ? `${canonicalPrefix}${pathname.slice(projectPrefix.length)}`
    : canonicalPrefix;

  return search ? `${normalizedPath}${search}` : normalizedPath;
}
