import { redirect } from 'next/navigation';

/**
 * Policy is managed per-agent on the detail page (Live View → agent card → POLICY tab).
 * Redirect any direct /behavior links to Live View.
 */
export default function BehaviorPage({
  params,
}: {
  params: { orgId: string; projectId: string };
}) {
  redirect(`/organizations/${params.orgId}/projects/${params.projectId}/live-view`);
}
