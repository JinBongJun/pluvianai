'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          // Base styles - Dark theme (Guardian Prestige)
          'block w-full rounded-md px-3 py-2 sm:text-sm',
          'bg-[#1e293b] border border-white/20',
          'text-white placeholder:text-slate-400',
          'shadow-sm transition-colors',
          // Focus states
          'focus:outline-none focus:ring-2 focus:ring-ag-accent focus:border-ag-accent',
          // Error states
          {
            'border-red-500/50 focus:border-red-500 focus:ring-red-500': error,
          },
          // Disabled states
          'disabled:bg-white/5 disabled:text-slate-500 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export default Input;

