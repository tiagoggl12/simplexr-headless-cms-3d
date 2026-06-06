import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/lib/utils.js';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label, rendered as a <label> associated with the input via htmlFor. */
  label?: string;
  /** Validation message shown below the field; also wires aria-invalid + aria-describedby. */
  error?: string;
  /** Helper text shown below the field. */
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, id, label, error, hint, required, ...props }, ref) => {
    const reactId = useId();
    const inputId = id ?? reactId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-2">
            {label}
            {required && (
              <span className="text-danger ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none',
            error && 'border-red-300',
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1 text-xs text-gray-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
