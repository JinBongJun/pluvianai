"use client";

import useSWR from "swr";
import { authAPI } from "@/lib/api/auth";
import { useAuthSession } from "@/hooks/useAuthSession";
import { ACCOUNT_USAGE_SWR_KEY } from "@/lib/accountUsage";
import type { AccountUsageApiResponse } from "@/lib/accountUsage";

/**
 * Account-wide usage (`/auth/me/usage`). Single SWR key everywhere for cache sharing.
 */
export function useAccountUsage(enabled = true) {
  const { isAuthenticated, isLoading: authLoading } = useAuthSession();
  const shouldFetch = enabled && isAuthenticated && !authLoading;

  return useSWR<AccountUsageApiResponse>(
    shouldFetch ? ACCOUNT_USAGE_SWR_KEY : null,
    () => authAPI.getMyUsage(),
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
    }
  );
}
