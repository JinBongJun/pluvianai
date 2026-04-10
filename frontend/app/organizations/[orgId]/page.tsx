import { redirect } from "next/navigation";

interface OrganizationPageProps {
  params: Promise<{
    orgId: string;
  }>;
}

export default async function OrganizationPage({ params }: OrganizationPageProps) {
  const { orgId } = await params;
  redirect(`/organizations/${orgId}/projects`);
}
