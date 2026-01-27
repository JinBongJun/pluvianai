'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface QuotaExceededStateProps {
  title?: string;
  description?: string;
  upgradeUrl?: string;
  className?: string;
}

export default function QuotaExceededState({
  title = 'Quota exceeded',
  description = "You've hit your plan limit. Upgrade to continue or wait for the next billing cycle.",
  upgradeUrl = '/settings/billing',
  className,
}: QuotaExceededStateProps) {
  const router = useRouter();
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl',
        'bg-amber-500/10 border border-amber-500/20',
        className
      )}
    >
      <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-amber-400" />
      </div>
      <h3 className="text-lg font-semibold text-amber-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">{description}</p>
      <Button
        onClick={() => router.push(upgradeUrl)}
        className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white"
      >
        <ArrowUpCircle className="w-4 h-4" />
        Upgrade plan
      </Button>
    </div>
  );
}
