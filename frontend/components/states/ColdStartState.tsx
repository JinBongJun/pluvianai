'use client';

import { ReactNode } from 'react';
import { Snowflake, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface ColdStartStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  className?: string;
}

export default function ColdStartState({
  title = 'No data yet',
  description = 'Connect your project or send traffic to see insights here.',
  actionLabel,
  onAction,
  icon,
  className,
}: ColdStartStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl',
        'bg-white/5 border border-white/10',
        className
      )}
    >
      {icon ?? (
        <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
          <Snowflake className="w-7 h-7 text-slate-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
