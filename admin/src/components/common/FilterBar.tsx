/**
 * FilterBar Component
 * A component for managing filters in lists and tables
 */

import { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { cn } from '@/lib/utils';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
}

function SearchInputLocal({ value, onChange, placeholder = 'Buscar...', className, onClear }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-gray-400" />
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
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: {
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string | null) => void;
  }[];
  activeFilters?: Record<string, string>;
  onClearFilters?: () => void;
  className?: string;
  actions?: ReactNode;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  filters = [],
  activeFilters = {},
  onClearFilters,
  className,
  actions,
}: FilterBarProps): JSX.Element {
  const hasActiveFilters = Object.values(activeFilters).some((v) => v !== '');

  return (
    <div className={cn('flex flex-col sm:flex-row gap-4 items-start sm:items-center', className)}>
      {/* Search Input */}
      <div className="flex-1 max-w-md w-full">
        <SearchInputLocal
          value={searchValue}
          onChange={onSearchChange}
          placeholder="Buscar..."
        />
      </div>

      {/* Filter Dropdowns */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map((filter) => (
          <div key={filter.value} className="w-40">
            <Dropdown
              label={filter.label}
              options={[
                { value: '', label: `Todas ${filter.label}s` },
                ...filter.options.map((opt) => ({
                  value: opt.value,
                  label: `${opt.label}${opt.count !== undefined ? ` (${opt.count})` : ''}`,
                })),
              ]}
              value={activeFilters[filter.value] || ''}
              onChange={(value) => filter.onChange(value || null)}
            />
          </div>
        ))}

        {/* Clear Filters */}
        {hasActiveFilters && onClearFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Additional Actions */}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// Page Header Component
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4', className)}>
      <div>
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-2" aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm text-gray-500">
              {breadcrumbs.map((crumb, index) => (
                <li key={index} className="flex items-center gap-2">
                  {index > 0 && <span className="text-gray-300">/</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="hover:text-gray-700">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-gray-900 font-medium">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>

        {/* Description */}
        {description && (
          <p className="text-gray-500 mt-1">{description}</p>
        )}
      </div>

      {/* Actions */}
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
