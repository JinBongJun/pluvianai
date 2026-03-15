"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";

/**
 * Snapshots page has been removed. Redirect to Live View where snapshots are shown per agent.
 */
export default function SnapshotsRedirectPage() {
  const router = useRouter();
  const { orgId, projectId } = useOrgProjectParams();

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
