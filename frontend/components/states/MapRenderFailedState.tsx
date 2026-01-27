'use client';

import { MapPin, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface MapRenderFailedStateProps {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

export default function MapRenderFailedState({
  title = 'Map couldn’t load',
  description = 'The agent map failed to render. This can happen with large graphs or connectivity issues.',
  retryLabel = 'Retry',
  onRetry,
  className,
}: MapRenderFailedStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl',
        'bg-slate-800/80 border border-white/10',
        className
      )}
    >
      <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center mb-4">
        <MapPin className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{description}</p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="ghost"
          className="flex items-center gap-2 text-slate-300 hover:bg-white/5"
        >
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
