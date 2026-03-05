import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes.
 * Uses clsx for conditional classes and tailwind-merge for conflict resolution.
 *
 * @example
 * cn('px-2 py-1', 'px-4') // 'py-1 px-4' (px-2 is overridden by px-4)
 * cn('text-red-500', condition && 'text-blue-500') // conditional class
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
