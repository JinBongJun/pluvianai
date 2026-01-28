'use client';

import { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
}

export default function Badge({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full',
        {
          // Variants
          'bg-white/10 text-ag-text': variant === 'default',
          'bg-green-500/15 text-green-300': variant === 'success',
          'bg-amber-500/15 text-amber-300': variant === 'warning',
          'bg-red-500/15 text-red-300': variant === 'error',
          'bg-sky-500/15 text-sky-300': variant === 'info',
          // Sizes
          'px-2 py-0.5 text-xs': size === 'sm',
          'px-2.5 py-1 text-xs': size === 'md',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

