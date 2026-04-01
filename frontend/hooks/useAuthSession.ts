"use client";

import useSWR from "swr";

type AuthSessionState = {
  isAuthenticated: boolean;
  isLoading: boolean;
};

export function useAuthSession(): AuthSessionState {
  const { data, isLoading } = useSWR<{ authenticated?: boolean }>(
    "auth-status",
    async () => {
      const response = await fetch("/api/auth/status", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      return (await response.json().catch(() => ({}))) as { authenticated?: boolean };
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  );

  return {
    isAuthenticated: !!data?.authenticated,
    isLoading,
  };
}
