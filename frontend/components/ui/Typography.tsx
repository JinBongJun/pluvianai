import React from "react";
import { clsx } from "clsx";

export function H1({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={clsx("text-3xl md:text-4xl font-bold text-white tracking-tight", className)}
      {...props}
    >
      {children}
    </h1>
  );
}

export function H2({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={clsx("text-2xl font-semibold text-white tracking-tight", className)} {...props}>
      {children}
    </h2>
  );
}

export function H3({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={clsx("text-lg font-semibold text-slate-200", className)} {...props}>
      {children}
    </h3>
  );
}

export function Text({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx("text-sm text-slate-300", className)} {...props}>
      {children}
    </p>
  );
}

export function HelperText({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx("text-xs text-slate-500", className)} {...props}>
      {children}
    </p>
  );
}

export function LabelText({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx("text-xs font-medium text-slate-400 uppercase tracking-[0.12em]", className)}
      {...props}
    >
      {children}
    </span>
  );
}
