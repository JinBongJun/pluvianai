import { redirect } from "next/navigation";

export default function Page({ params }: { params: { orgId: string; projectId: string } }) {
  redirect(`/organizations/${params.orgId}/projects/${params.projectId}/live-view`);
}
