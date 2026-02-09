/**
 * Alert Component
 * An alert component for displaying messages
 */

import { ReactNode } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
  showIcon?: boolean;
}

const alertStyles: Record<AlertVariant, { container: string; icon: string; title: string }> = {
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: 'text-blue-500',
    title: 'text-blue-800',
  },
  success: {
    container: 'bg-green-50 border-green-200 text-green-800',
    icon: 'text-green-500',
    title: 'text-green-800',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: 'text-amber-500',
    title: 'text-amber-800',
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-800',
    icon: 'text-red-500',
    title: 'text-red-800',
  },
};

const icons: Record<AlertVariant, ReactNode> = {
  info: <Info className="w-5 h-5" />,
  success: <CheckCircle className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  error: <AlertCircle className="w-5 h-5" />,
};

export function Alert({
  variant = 'info',
  title,
  children,
  onDismiss,
  className,
  showIcon = true,
}: AlertProps): JSX.Element {
  const styles = alertStyles[variant];

  return (
    <div
      className={cn(
        'relative flex gap-3 p-4 border rounded-lg',
        styles.container,
        className
      )}
      role="alert"
      aria-live="polite"
    >
      {showIcon && (
        <div className={cn('flex-shrink-0 mt-0.5', styles.icon)}>
          {icons[variant]}
        </div>
      )}
      <div className="flex-1">
        {title && (
          <h4 className={cn('font-medium mb-1', styles.title)}>
            {title}
          </h4>
        )}
        <div className="text-sm">{children}</div>
      </div>
      {onDismiss && (
        <div className="flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="p-0 hover:bg-transparent opacity-60 hover:opacity-100"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Search Input Component
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounce?: number;
  onClear?: () => void;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debounce: _debounce,
  onClear,
}: SearchInputProps): JSX.Element {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          className="h-5 w-5 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg',
          'text-sm placeholder-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          'transition-colors'
        )}
        aria-label="Buscar"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClear?.();
          }}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          aria-label="Limpar busca"
        >
          <svg
            className="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
