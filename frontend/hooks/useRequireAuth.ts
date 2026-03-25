"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthSession } from "./useAuthSession";

type UseRequireAuthOptions = {
  redirectTo?: string;
  nextPath?: string;
};

export function useRequireAuth(options?: UseRequireAuthOptions): boolean {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthSession();
  const redirectTo = options?.redirectTo || "/login";

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) return;
    if (isAuthenticated) {
      return;
    }

    const inferredNext =
      options?.nextPath || `${window.location.pathname}${window.location.search || ""}`;
    const encoded = encodeURIComponent(inferredNext);
    router.push(`${redirectTo}?reauth=1&next=${encoded}`);
  }, [isAuthenticated, isLoading, router, redirectTo, options?.nextPath]);

  return isAuthenticated;
}
