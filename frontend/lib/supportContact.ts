/** Public billing and support contact (mailto). */
export const SUPPORT_EMAIL = "bongjun0289@gmail.com";

export function supportMailtoHref(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
