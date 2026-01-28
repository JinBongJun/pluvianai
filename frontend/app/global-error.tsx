'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import Button from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="bg-ag-bg min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Something went wrong</h2>
          <p className="text-slate-400 mb-6">
            {error.message || 'An unexpected error occurred'}
          </p>
          <Button onClick={reset} className="w-full">
            Try Again
          </Button>
        </div>
      </body>
    </html>
  );
}
