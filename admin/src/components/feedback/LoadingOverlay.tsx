/**
 * LoadingOverlay Component
 * A full-screen or container overlay with spinner for loading states
 */

import { forwardRef } from 'react';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';

interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  show: boolean;
  message?: string;
  fullScreen?: boolean;
  blur?: boolean;
}

export const LoadingOverlay = forwardRef<HTMLDivElement, LoadingOverlayProps>(
  ({ show, message, fullScreen = false, blur = false, className, children, ...props }, ref) => {
    if (!show) {
      return <>{children}</>;
    }

    const overlayContent = (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center gap-4',
          fullScreen
            ? 'fixed inset-0 z-50 bg-white/80 backdrop-blur-sm'
            : 'absolute inset-0 bg-white/60 backdrop-blur-sm rounded-lg',
          className
        )}
        role="status"
        aria-live="polite"
        {...props}
      >
        <Spinner size="lg" />
        {message && (
          <p className="text-gray-600 font-medium animate-pulse">{message}</p>
        )}
        <span className="sr-only">Carregando...</span>
      </div>
    );

    if (fullScreen) {
      return overlayContent;
    }

    return (
      <div className="relative">
        {overlayContent}
        <div className="opacity-50 pointer-events-none">{children}</div>
      </div>
    );
  }
);

LoadingOverlay.displayName = 'LoadingOverlay';

// Inline loader for buttons and small spaces
interface InlineLoaderProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function InlineLoader({ size = 'sm', className, ...props }: InlineLoaderProps): JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} {...props}>
      <Spinner size={size} />
    </span>
  );
}

// Full page loader
export function FullPageLoader({ message = 'Carregando...' }: { message?: string }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <Spinner size="xl" />
      <p className="mt-4 text-gray-600 font-medium animate-pulse">{message}</p>
    </div>
  );
}
