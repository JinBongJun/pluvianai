/**
 * Unified redirect after org/project delete.
 * Use this instead of window.location.assign to avoid race conditions.
 */
export function safeReplace(
  router: { replace: (href: string) => void },
  href: string
): void {
  router.replace(href);
}
