import { redirect } from "next/navigation";

/**
 * Policy is managed per-agent on the detail page (Live View → agent card → POLICY tab).
 * Redirect any direct /behavior links to Live View.
 */
export default async function BehaviorPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = await params;
  redirect(`/organizations/${orgId}/projects/${projectId}/live-view`);
}
