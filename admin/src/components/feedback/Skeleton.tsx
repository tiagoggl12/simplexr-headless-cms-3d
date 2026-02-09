/**
 * Skeleton Component
 * A pulse-loading placeholder component for content loading states
 */

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

const variantClasses = {
  text: 'rounded',
  circular: 'rounded-full',
  rectangular: 'rounded-lg',
};

const animationClasses = {
  pulse: 'animate-pulse',
  wave: 'animate-[shimmer_2s_infinite]',
  none: '',
};

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'text', width, height, animation = 'pulse', style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-gray-200',
          variantClasses[variant],
          animationClasses[animation],
          className
        )}
        style={{
          width: width,
          height: height,
          ...style,
        }}
        aria-hidden="true"
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

// Predefined skeleton patterns for common use cases

export function SkeletonCard(): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-start gap-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <Skeleton height={100} />
      <div className="flex gap-2">
        <Skeleton width={80} height={32} />
        <Skeleton width={80} height={32} />
      </div>
    </div>
  );
}

export function SkeletonTableRow(): JSX.Element {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="space-y-2">
            <Skeleton width={150} height={14} />
            <Skeleton width={100} height={12} />
          </div>
        </div>
      </td>
      <td className="py-4 px-4">
        <Skeleton width={80} height={20} />
      </td>
      <td className="py-4 px-4">
        <Skeleton width={60} height={20} />
      </td>
      <td className="py-4 px-4">
        <Skeleton width={100} height={20} />
      </td>
      <td className="py-4 px-4">
        <Skeleton width={80} height={32} />
      </td>
    </tr>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }): JSX.Element {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// Custom shimmer animation styles
export const skeletonStyles = `
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
  
  .animate-shimmer {
    background: linear-gradient(
      90deg,
      #e5e7eb 0%,
      #f3f4f6 50%,
      #e5e7eb 100%
    );
    background-size: 200% 100%;
  }
`;
