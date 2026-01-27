'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface ConnectionFailedStateProps {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

export default function ConnectionFailedState({
  title = 'Connection failed',
  description = 'We couldn’t reach the server. Check your network and try again.',
  retryLabel = 'Retry',
  onRetry,
  className,
}: ConnectionFailedStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl',
        'bg-red-500/10 border border-red-500/20',
        className
      )}
    >
      <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
        <WifiOff className="w-7 h-7 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-red-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{description}</p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          className="flex items-center gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10"
        >
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
