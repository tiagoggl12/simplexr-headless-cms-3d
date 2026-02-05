import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils.js';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
