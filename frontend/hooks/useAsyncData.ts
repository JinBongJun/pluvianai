'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isInitialLoad: boolean;
}

export interface UseAsyncDataOptions<T> {
  /** Initial data value */
  initialData?: T | null;
  /** Dependencies that trigger refetch when changed */
  deps?: any[];
  /** Whether to fetch immediately on mount */
  immediate?: boolean;
  /** Transform the fetched data */
  transform?: (data: any) => T;
  /** Called on successful fetch */
  onSuccess?: (data: T) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Keep previous data while loading new data */
  keepPreviousData?: boolean;
}

export interface UseAsyncDataReturn<T> extends AsyncState<T> {
  /** Manually trigger a refetch */
  refetch: () => Promise<void>;
  /** Reset to initial state */
  reset: () => void;
  /** Set data manually */
  setData: (data: T | null) => void;
}

/**
 * Custom hook for async data fetching with loading and error states
 * 
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useAsyncData(
 *   () => apiCallsAPI.list(projectId),
 *   { deps: [projectId, filters] }
 * );
 * ```
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  options: UseAsyncDataOptions<T> = {}
): UseAsyncDataReturn<T> {
  const {
    initialData = null,
    deps = [],
    immediate = true,
    transform,
    onSuccess,
    onError,
    keepPreviousData = true,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: immediate,
    error: null,
    isInitialLoad: true,
  });

  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      // Keep previous data if option is enabled and we have data
      data: keepPreviousData ? prev.data : null,
    }));

    try {
      const result = await fetcher();
      
      // Ignore stale responses
      if (!mountedRef.current || fetchId !== fetchIdRef.current) {
        return;
      }

      const transformedData = transform ? transform(result) : result;

      setState({
        data: transformedData,
        loading: false,
        error: null,
        isInitialLoad: false,
      });

      onSuccess?.(transformedData);
    } catch (err) {
      // Ignore stale responses
      if (!mountedRef.current || fetchId !== fetchIdRef.current) {
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));

      setState((prev) => ({
        ...prev,
        loading: false,
        error,
        isInitialLoad: false,
      }));

      onError?.(error);
    }
  }, [fetcher, transform, onSuccess, onError, keepPreviousData]);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
      isInitialLoad: true,
    });
  }, [initialData]);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  // Fetch on mount and when deps change
  useEffect(() => {
    if (immediate) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    ...state,
    refetch: fetchData,
    reset,
    setData,
  };
}

/**
 * Simpler version for one-time fetches without dependencies
 */
export function useAsyncFetch<T>(
  fetcher: () => Promise<T>,
  options: Omit<UseAsyncDataOptions<T>, 'deps'> = {}
): UseAsyncDataReturn<T> {
  return useAsyncData(fetcher, { ...options, deps: [] });
}

export default useAsyncData;
