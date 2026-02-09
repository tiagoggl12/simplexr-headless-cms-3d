/**
 * useMediaQuery Hook
 * Responsive design helper for media queries
 */

import { useState, useEffect } from 'react';

// Breakpoint values matching Tailwind CSS
const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Check if a media query matches
 * @param query - The media query string
 * @returns boolean indicating if the query matches
 */
function isMatch(query: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia(query).matches;
}

/**
 * Hook to check if a media query matches
 * @param query - The media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => isMatch(query));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener('change', handler);

    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

/**
 * Hook to check if screen is mobile (below md breakpoint)
 */
export function useIsMobile(): boolean {
  return !useMediaQuery(`(min-width: ${BREAKPOINTS.md})`);
}

/**
 * Hook to check if screen is tablet (md to lg breakpoint)
 */
export function useIsTablet(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.md})`) && !useMediaQuery(`(min-width: ${BREAKPOINTS.lg})`);
}

/**
 * Hook to check if screen is desktop (lg and above)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.lg})`);
}

/**
 * Hook to check a specific breakpoint
 * @param breakpoint - The breakpoint to check (sm, md, lg, xl, 2xl)
 * @param direction - 'up' for min-width, 'down' for max-width
 */
export function useBreakpoint(breakpoint: Breakpoint, direction: 'up' | 'down' = 'up'): boolean {
  const value = BREAKPOINTS[breakpoint];
  
  if (direction === 'up') {
    return useMediaQuery(`(min-width: ${value})`);
  }
  
  // For 'down', we need to subtract 1px to avoid overlap
  const numericValue = parseInt(value, 10);
  return useMediaQuery(`(max-width: ${numericValue - 1}px)`);
}

/**
 * Hook to get current window width
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  useEffect(() => {
    const handler = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener('resize', handler);

    return () => {
      window.removeEventListener('resize', handler);
    };
  }, []);

  return width;
}

/**
 * Hook to get current window height
 */
export function useWindowHeight(): number {
  const [height, setHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 0
  );

  useEffect(() => {
    const handler = () => {
      setHeight(window.innerHeight);
    };

    window.addEventListener('resize', handler);

    return () => {
      window.removeEventListener('resize', handler);
    };
  }, []);

  return height;
}

// Export breakpoints for reference
export { BREAKPOINTS };
export type { Breakpoint };
