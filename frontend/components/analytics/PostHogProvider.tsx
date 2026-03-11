// Analytics - PostHogProvider
"use client";

import React, { useEffect } from "react";

interface PostHogProviderProps {
  children: React.ReactNode;
}

export const PostHogProvider: React.FC<PostHogProviderProps> = ({ children }) => {
  useEffect(() => {
    if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    let cancelled = false;
    import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;
      if ((posthog as any).__loaded) return;
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        loaded: (ph: any) => {
          if (process.env.NODE_ENV === "development") ph.debug();
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
};

export default PostHogProvider;
