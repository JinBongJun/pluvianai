'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
  showDetails?: boolean;
  details?: string;
}

export default function ErrorDisplay({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
  showDetails = false,
  details,
}: ErrorDisplayProps) {
  return (
    <div className={clsx('bg-red-50 border border-red-200 rounded-lg p-6', className)}>
      <div className="flex items-start gap-4">
        <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-lg font-medium text-red-900 mb-2">{title}</h3>
          <p className="text-sm text-red-700 mb-4">{message}</p>
          {showDetails && details && (
            <details className="mb-4">
              <summary className="text-sm text-red-600 cursor-pointer hover:text-red-800">
                Show details
              </summary>
              <pre className="mt-2 text-xs text-red-600 bg-red-100 p-3 rounded overflow-auto">
                {details}
              </pre>
            </details>
          )}
          {onRetry && (
            <Button
              variant="danger"
              onClick={onRetry}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
