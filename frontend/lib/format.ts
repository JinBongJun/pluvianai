export const toNumber = (value: unknown, fallback: number = 0): number => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const toFixedSafe = (value: unknown, digits: number = 0, fallback: number = 0): string => {
  const num = toNumber(value, fallback);
  return num.toFixed(digits);
};
