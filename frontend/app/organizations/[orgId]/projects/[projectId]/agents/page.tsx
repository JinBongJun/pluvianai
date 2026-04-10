import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = await params;
  redirect(`/organizations/${orgId}/projects/${projectId}/live-view`);
}
