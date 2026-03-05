import React, { forwardRef, SelectHTMLAttributes } from "react";
import { clsx } from "clsx";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  options?: { value: string; label: string }[];
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", options, onChange, placeholder, error, children, ...props }, ref) => {
    return (
      <div className="w-full">
        <select
          ref={ref}
          className={clsx(
            "w-full px-3 py-2",
            "bg-white/5 border border-white/10 rounded-lg",
            "text-sm text-white",
            "focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all",
            error && "border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50",
            className
          )}
          onChange={e => onChange?.(e.target.value)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options
            ? options.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
