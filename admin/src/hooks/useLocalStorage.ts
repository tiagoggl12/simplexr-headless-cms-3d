/**
 * useLocalStorage Hook
 * Hook for persisting state to localStorage
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to persist state to localStorage
 * @param key - The localStorage key
 * @param initialValue - The initial value
 * @returns Tuple of [value, setValue]
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  // Get from localStorage
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of setValue that persists to localStorage
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * Hook to use localStorage with JSON parsing
 * @param key - The localStorage key
 * @param initialValue - The initial value
 * @returns The stored value
 */
export function useLocalStorageJSON<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  return useLocalStorage<T>(key, initialValue);
}

/**
 * Hook to remove a localStorage key
 * @param key - The localStorage key to remove
 */
export function useLocalStorageRemove(key: string): () => void {
  return useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  }, [key]);
}

/**
 * Hook to subscribe to localStorage changes
 * Useful for syncing across tabs
 */
export function useLocalStorageSync<T>(key: string, initialValue: T): T {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key && event.newValue) {
        try {
          setValue(JSON.parse(event.newValue));
        } catch {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key]);

  return value;
}
