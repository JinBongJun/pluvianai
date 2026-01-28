'use client';

import { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={clsx('text-center py-12 px-6 bg-ag-surface border border-white/10 rounded-2xl shadow-xl', className)}>
      {icon && <div className="mb-4 flex justify-center text-ag-accent">{icon}</div>}
      <h3 className="text-xl font-bold text-ag-text mb-2">{title}</h3>
      <p className="text-sm text-ag-muted mb-8 max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
