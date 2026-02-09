/**
 * Custom Hooks Index
 * Reusable hooks for common functionality
 */

// Async & Data
export { useAsync, useAsyncData, isApiError, isNetworkError, getErrorMessage } from './useAsync.js';
export type { AsyncState } from './useAsync.js';

// Debounce
export { useDebounce, useDebouncedCallback } from './useDebounce.js';

// Media Queries
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useBreakpoint,
  useWindowWidth,
  useWindowHeight,
  BREAKPOINTS,
} from './useMediaQuery.js';

// Local Storage
export {
  useLocalStorage,
  useLocalStorageJSON,
  useLocalStorageRemove,
  useLocalStorageSync,
} from './useLocalStorage.js';
