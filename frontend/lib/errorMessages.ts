export type ErrorKey =
  | 'invalid_credentials'
  | 'inactive'
  | 'rate_limited'
  | 'captcha_required'
  | 'network_error'
  | 'unknown';

const errorMessages: Record<ErrorKey, string> = {
  invalid_credentials: 'Email or password is incorrect. Please try again.',
  inactive: 'Your account is inactive. Contact support.',
  rate_limited: 'Too many attempts. Please wait and try again.',
  captcha_required: 'Please complete CAPTCHA to continue.',
  network_error: 'Cannot reach the server. Check your connection.',
  unknown: 'An unexpected error occurred. Please try again.',
};

export function getErrorMessage(key: string | undefined): string {
  if (!key) return errorMessages.unknown;
  return errorMessages[key as ErrorKey] ?? errorMessages.unknown;
}
