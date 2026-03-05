"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function OrganizationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Organizations Error]:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-pluvian-text">Something went wrong</h2>
        <p className="text-pluvian-muted max-w-md">
          An error occurred while loading organizations.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-6 py-2 bg-pluvian-bio-500 text-white rounded-md hover:bg-pluvian-bio-600 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-6 py-2 border border-pluvian-border rounded-md hover:bg-pluvian-surface transition-colors"
        >
          Back to home
        </Link>
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
