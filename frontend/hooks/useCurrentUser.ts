"use client";

import useSWR from "swr";

import { authAPI } from "@/lib/api/auth";
import { useAuthSession } from "@/hooks/useAuthSession";

export type CurrentUser = {
  email?: string;
  full_name?: string;
  [key: string]: unknown;
};

export function useCurrentUser(enabled = true) {
  const { isAuthenticated, isLoading: authLoading } = useAuthSession();
  const shouldFetch = enabled && isAuthenticated && !authLoading;

  return useSWR<CurrentUser>(
    shouldFetch ? "auth-current-user" : null,
    () => authAPI.getCurrentUser(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  );
}
