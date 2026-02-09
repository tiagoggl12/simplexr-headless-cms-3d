/**
 * useAsync Hook
 * Hook for managing async operations with proper state management
 */

import { useState, useCallback, useEffect } from 'react';
import { ApiError, NetworkError } from '@/lib/api/axios';

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

interface AsyncOptions {
  immediate?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * Create an async state object
 */
function createAsyncState<T>(): AsyncState<T> {
  return {
    status: 'idle',
    data: null,
    error: null,
    isLoading: false,
    isSuccess: false,
    isError: false,
  };
}

/**
 * Hook for managing async operations
 * @param asyncFunction - The async function to execute
 * @param options - Configuration options
 * @returns Object containing state and execute function
 */
export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  options: AsyncOptions = {}
) {
  const [state, setState] = useState<AsyncState<T>>(createAsyncState<T>());

  const { immediate = false, onSuccess, onError } = options;

  const execute = useCallback(async (...args: Parameters<typeof asyncFunction>) => {
    setState((prev) => ({
      ...prev,
      status: 'loading',
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: null,
    }));

    try {
      const data = await asyncFunction(...args);
      
      setState({
        status: 'success',
        data,
        error: null,
        isLoading: false,
        isSuccess: true,
        isError: false,
      });

      onSuccess?.(data);
      return data;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      setState({
        status: 'error',
        data: null,
        error: errorObj,
        isLoading: false,
        isSuccess: false,
        isError: true,
      });

      onError?.(errorObj);
      throw errorObj;
    }
  }, [asyncFunction, onSuccess, onError]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  const reset = useCallback(() => {
    setState(createAsyncState<T>());
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook for data fetching with automatic refetch
 * @param fetcher - The async function to fetch data
 * @param deps - Dependencies that trigger refetch
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = []
) {
  const [state, setState] = useState<AsyncState<T>>(createAsyncState<T>());

  const refetch = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      status: 'loading',
      isLoading: true,
    }));

    try {
      const data = await fetcher();
      
      setState({
        status: 'success',
        data,
        error: null,
        isLoading: false,
        isSuccess: true,
        isError: false,
      });

      return data;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      setState({
        status: 'error',
        data: null,
        error: errorObj,
        isLoading: false,
        isSuccess: false,
        isError: true,
      });

      throw errorObj;
    }
  }, [fetcher]);

  useEffect(() => {
    refetch();
  }, [...deps]);

  return {
    ...state,
    refetch,
  };
}

/**
 * Helper type for async state
 */
export type { AsyncState };

/**
 * Check if error is an API error
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Get error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof NetworkError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}
