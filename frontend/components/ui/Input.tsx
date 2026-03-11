import React, { forwardRef, InputHTMLAttributes } from "react";
import { clsx } from "clsx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          "flex h-10 w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-white",
          "placeholder:text-slate-500",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0a0a0c] disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
            : "border-white/20 focus:border-emerald-500 focus:ring-emerald-500",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
