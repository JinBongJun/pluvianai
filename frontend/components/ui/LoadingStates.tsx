'use client';

import LoadingSpinner from '../LoadingSpinner';
import Skeleton from './Skeleton';
import { clsx } from 'clsx';

type LoadingTone = 'default' | 'muted' | 'inverted';

interface LoadingStateProps {
  text?: string;
  tone?: LoadingTone;
  className?: string;
}

export function ShortLoading({ text = 'Loading...', tone = 'default', className }: LoadingStateProps) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <LoadingSpinner size="sm" />
      <span className={clsx('text-sm', tone === 'muted' ? 'text-slate-500' : 'text-white')}>{text}</span>
    </div>
  );
}

export function MediumLoading({
  text = 'Loading data...',
  tone = 'default',
  className,
}: LoadingStateProps) {
  return (
    <div className={clsx('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <LoadingSpinner size="md" />
        <span className={clsx('text-sm', tone === 'muted' ? 'text-slate-500' : 'text-white')}>{text}</span>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function LongLoading({
  text = 'Preparing your data...',
  tone = 'default',
  className,
}: LoadingStateProps) {
  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <div className="h-2 w-2/3 rounded-full bg-purple-500 animate-pulse" />
        <span className={clsx('text-sm', tone === 'muted' ? 'text-slate-500' : 'text-white')}>{text}</span>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-full" variant="text" />
        <Skeleton className="h-5 w-5/6" variant="text" />
        <Skeleton className="h-32 w-full" variant="rectangular" />
      </div>
    </div>
  );
}
