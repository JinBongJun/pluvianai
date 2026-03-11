"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type UseRequireAuthOptions = {
  redirectTo?: string;
  nextPath?: string;
};

export function useRequireAuth(options?: UseRequireAuthOptions): boolean {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const redirectTo = options?.redirectTo || "/login";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("access_token");
    if (token) {
      setHasToken(true);
      return;
    }

    const inferredNext =
      options?.nextPath || `${window.location.pathname}${window.location.search || ""}`;
    const encoded = encodeURIComponent(inferredNext);
    router.push(`${redirectTo}?reauth=1&next=${encoded}`);
  }, [router, redirectTo, options?.nextPath]);

  return hasToken;
}
