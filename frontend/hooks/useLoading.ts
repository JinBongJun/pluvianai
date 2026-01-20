'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseLoadingOptions {
  minDuration?: number; // ms
}

export function useLoading(options: UseLoadingOptions = {}) {
  const { minDuration = 300 } = options;
  const [isLoading, setIsLoading] = useState(false);
  const activeCount = useRef(0);
  const startTime = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback(() => {
    activeCount.current += 1;
    if (!startTime.current) {
      startTime.current = Date.now();
    }
    setIsLoading(true);
  }, []);

  const stop = useCallback(() => {
    activeCount.current = Math.max(0, activeCount.current - 1);
    const elapsed = startTime.current ? Date.now() - startTime.current : 0;
    const remaining = Math.max(0, minDuration - elapsed);

    const finalize = () => {
      if (activeCount.current === 0) {
        startTime.current = null;
        setIsLoading(false);
      }
    };

    if (remaining > 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(finalize, remaining);
    } else {
      finalize();
    }
  }, [minDuration]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isLoading, start, stop };
}
