'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'link';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex min-h-[44px] items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
          {
            // Variants
            'bg-ag-primary text-ag-bg hover:bg-ag-primaryHover shadow-glow-neon focus:ring-ag-accent transition-all duration-200': variant === 'primary',
            'bg-white/5 text-ag-text hover:bg-white/10 focus:ring-ag-accent': variant === 'secondary',
            'bg-transparent text-ag-muted hover:bg-white/5 hover:text-ag-text focus:ring-ag-accent': variant === 'ghost',
            'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-lg shadow-red-500/50 transition-all duration-200': variant === 'danger',
            'border border-white/15 bg-transparent text-ag-text hover:bg-white/5 hover:border-white/25 focus:ring-ag-accent transition-all duration-200': variant === 'outline',
            'text-ag-accent hover:text-ag-accentLight underline-offset-4 hover:underline bg-transparent': variant === 'link',
            // Sizes
            'px-3 py-1.5 text-sm gap-1.5': size === 'sm',
            'px-4 py-2 text-sm gap-2': size === 'md',
            'px-6 py-3 text-base gap-2': size === 'lg',
          },
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
