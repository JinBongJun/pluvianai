import { redirect } from "next/navigation";

interface OrganizationPageProps {
  params: {
    orgId: string;
  };
}

export default function OrganizationPage({ params }: OrganizationPageProps) {
  redirect(`/organizations/${params.orgId}/projects`);
}
