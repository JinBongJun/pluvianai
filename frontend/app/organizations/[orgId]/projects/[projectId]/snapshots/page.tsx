"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Snapshots page has been removed. Redirect to Live View where snapshots are shown per agent.
 */
export default function SnapshotsRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId;

  useEffect(() => {
    if (orgId && projectId) {
      router.replace(`/organizations/${orgId}/projects/${projectId}/live-view`);
    }
  }, [orgId, projectId, router]);

  return (
    <div className="flex items-center justify-center min-h-[200px] text-slate-400 text-sm">
      Redirecting to Live View…
    </div>
  );
}
