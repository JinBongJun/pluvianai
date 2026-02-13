import { redirect } from 'next/navigation'

interface ProjectPageProps {
    params: {
        orgId: string;
        projectId: string;
    }
}

export default function ProjectPage({ params }: ProjectPageProps) {
    redirect(`/organizations/${params.orgId}/projects/${params.projectId}/live-view`)
}
