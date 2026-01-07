'use client';

import { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
}

export default function Skeleton({
  className,
  variant = 'text',
  ...props
}: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse bg-gray-200 rounded',
        {
          'h-4 w-full': variant === 'text',
          'h-10 w-10 rounded-full': variant === 'circular',
          'h-24 w-full': variant === 'rectangular',
        },
        className
      )}
      {...props}
    />
  );
}


