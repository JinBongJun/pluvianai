"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function isLikelyBrowserDomGlitch(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("removechild") ||
    m.includes("insertbefore") ||
    (m.includes("notfounderror") && m.includes("node"))
  );
}

export default function OrganizationDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const msg = error?.message ?? "";
  const showDomHint = isLikelyBrowserDomGlitch(msg);

  useEffect(() => {
    console.error("[Organizations org route]:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="text-center space-y-3 max-w-lg">
        <h2 className="text-2xl font-bold text-pluvian-text">Something went wrong</h2>
        <p className="text-pluvian-muted">
          This page hit an unexpected error while rendering. It is not necessarily a problem with your
          organization or permissions — often a refresh fixes it.
        </p>
        {showDomHint ? (
          <p className="text-pluvian-muted text-sm leading-relaxed">
            If this keeps happening, try a hard refresh, a private/incognito window, or temporarily
            disabling browser extensions that modify the page.
          </p>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-6 py-2 bg-pluvian-bio-500 text-white rounded-md hover:bg-pluvian-bio-600 transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/organizations")}
          className="px-6 py-2 border border-pluvian-border rounded-md hover:bg-pluvian-surface transition-colors"
        >
          Back to organizations
        </button>
      </div>

      {process.env.NODE_ENV === "development" && (
        <details className="mt-4 p-4 bg-pluvian-void/50 rounded-md max-w-2xl">
          <summary className="cursor-pointer text-sm text-pluvian-muted">Error details</summary>
          <pre className="mt-2 text-xs text-pluvian-triage-500 overflow-auto">{error.message}</pre>
        </details>
      )}
    </div>
  );
}
