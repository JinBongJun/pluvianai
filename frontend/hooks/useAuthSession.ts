"use client";

import { useEffect, useState } from "react";

type AuthSessionState = {
  isAuthenticated: boolean;
  isLoading: boolean;
};

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/auth/status", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as { authenticated?: boolean };
        if (!cancelled) {
          setState({
            isAuthenticated: !!data.authenticated,
            isLoading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            isAuthenticated: false,
            isLoading: false,
          });
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
