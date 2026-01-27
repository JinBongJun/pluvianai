'use client';

import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface AsyncJudgeStateProps {
  message?: string;
  className?: string;
}

export default function AsyncJudgeState({ message = 'Evaluating…', className }: AsyncJudgeStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl',
        'bg-white/5 border border-white/10',
        className
      )}
    >
      <Loader2 className="w-10 h-10 text-purple-400 animate-spin mb-4" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
