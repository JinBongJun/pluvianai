import { useEffect, useState } from "react";

/**
 * Returns a debounced value that only updates after the delay has elapsed.
 * Useful for throttling input-driven API calls (search/filter).
 */
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
