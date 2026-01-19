/**
 * Safe number conversion utility
 */
export const toNumber = (value: unknown, fallback: number = 0): number => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Safe toFixed with fallback
 */
export const toFixedSafe = (value: unknown, digits: number = 0, fallback: number = 0): string => {
  const num = toNumber(value, fallback);
  return num.toFixed(digits);
};

/**
 * Safe string conversion
 */
export const safeString = (value: unknown, fallback: string = ''): string => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

/**
 * Safe boolean conversion
 */
export const safeBoolean = (value: unknown, fallback: boolean = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  return Boolean(value);
};

/**
 * Safe array access with type guard
 */
export const safeArray = <T>(value: unknown, fallback: T[] = []): T[] => {
  return Array.isArray(value) ? value : fallback;
};

/**
 * Safe object access
 */
export const safeObject = <T extends Record<string, unknown>>(
  value: unknown,
  fallback: T = {} as T
): T => {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
};
