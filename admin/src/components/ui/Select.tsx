import { SelectHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/lib/utils.js';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visible label, rendered as a <label> associated with the select via htmlFor. */
  label?: string;
  /** Validation message shown below the field; also wires aria-invalid + aria-describedby. */
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, id, label, error, required, ...props }, ref) => {
    const reactId = useId();
    const selectId = id ?? reactId;
    const errorId = error ? `${selectId}-error` : undefined;

    const select = (
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none bg-white',
          error && 'border-red-300',
          className
        )}
        {...props}
      >
        {children}
      </select>
    );

    if (!label && !error) return select;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-2">
            {label}
            {required && (
              <span className="text-danger ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        {select}
        {error && (
          <p id={errorId} className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
