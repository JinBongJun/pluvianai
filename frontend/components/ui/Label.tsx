import React, { LabelHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Label({ className, children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx(
        "block text-sm font-medium leading-none text-slate-400 mb-1 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
