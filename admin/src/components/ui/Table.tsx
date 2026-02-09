/**
 * Table Component
 * A responsive table component with sorting and styling
 */

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Table Props
interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, striped = false, hoverable = true, bordered = false, ...props }, ref) => {
    return (
      <div className="overflow-x-auto">
        <table
          ref={ref}
          className={cn(
            'w-full',
            striped && 'divide-y divide-gray-200',
            bordered && 'border border-gray-200',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Table.displayName = 'Table';

// Table Header
interface TableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableHead = forwardRef<HTMLTableSectionElement, TableHeadProps>(
  ({ className, ...props }, ref) => {
    return (
      <thead
        ref={ref}
        className={cn('bg-gray-50', className)}
        {...props}
      />
    );
  }
);

TableHead.displayName = 'TableHead';

// Table Body
interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, ...props }, ref) => {
    return (
      <tbody
        ref={ref}
        className={cn('divide-y divide-gray-200', className)}
        {...props}
      />
    );
  }
);

TableBody.displayName = 'TableBody';

// Table Row
interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, selected = false, ...props }, ref) => {
    return (
      <tr
        ref={ref}
        className={cn(
          selected && 'bg-primary/5',
          className
        )}
        {...props}
      />
    );
  }
);

TableRow.displayName = 'TableRow';

// Table Header Cell
interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableHeaderCellElement> {
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
}

export const TableHeaderCell = forwardRef<HTMLTableHeaderCellElement, TableHeaderCellProps>(
  ({ className, sortable = false, sortDirection = null, children, ...props }, ref) => {
    const ariaSort = sortDirection 
      ? (sortDirection === 'asc' ? 'ascending' : 'descending') 
      : null;
    
    return (
      <th
        ref={ref}
        className={cn(
          'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
          sortable && 'cursor-pointer select-none hover:bg-gray-100',
          className
        )}
        {...(ariaSort ? { 'aria-sort': ariaSort } : {})}
        {...props}
      >
        {children}
      </th>
    );
  }
);

TableHeaderCell.displayName = 'TableHeaderCell';

// Table Cell
interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={cn('px-6 py-4 whitespace-nowrap text-sm text-gray-900', className)}
        {...props}
      />
    );
  }
);

TableCell.displayName = 'TableCell';

// Empty Table Row
interface EmptyTableRowProps {
  colSpan: number;
  message?: string;
}

export function EmptyTableRow({ colSpan, message = 'Nenhum registro encontrado' }: EmptyTableRowProps): JSX.Element {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-sm text-gray-500">
        {message}
      </td>
    </tr>
  );
}

// Loading Table Row
interface LoadingTableRowProps {
  colSpan: number;
  rows?: number;
}

export function LoadingTableRow({ colSpan, rows = 5 }: LoadingTableRowProps): JSX.Element {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: colSpan }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div className="h-4 bg-gray-200 rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
