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
          'block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm',
          'transition-colors',
          {
            'border-red-300 focus:border-red-500 focus:ring-red-500': error,
          },
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export default Input;

