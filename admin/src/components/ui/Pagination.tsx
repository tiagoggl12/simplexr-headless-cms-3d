/**
 * Pagination Component
 * A pagination component for navigating through paginated content
 */

import { forwardRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  showPageNumbers?: boolean;
  maxPageNumbers?: number;
}

export const Pagination = forwardRef<HTMLDivElement, PaginationProps>(
  (
    {
      currentPage,
      totalPages,
      onPageChange,
      className,
      showPageNumbers = true,
      maxPageNumbers = 5,
    },
    ref
  ) => {
    // Generate page numbers to display
    const getPageNumbers = (): (number | string)[] => {
      if (totalPages <= maxPageNumbers) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
      }

      const half = Math.floor(maxPageNumbers / 2);
      let start = Math.max(1, currentPage - half);
      let end = Math.min(totalPages, start + maxPageNumbers - 1);

      // Adjust start if end is at the boundary
      if (end - start + 1 < maxPageNumbers) {
        start = Math.max(1, end - maxPageNumbers + 1);
      }

      const pages: (number | string)[] = [];

      if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
      }

      return pages;
    };

    const pageNumbers = getPageNumbers();

    return (
      <nav
        ref={ref}
        className={cn('flex items-center gap-1', className)}
        role="navigation"
        aria-label="Navegação de paginação"
      >
        {/* Previous button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {/* Page numbers */}
        {showPageNumbers && (
          <div className="flex items-center gap-1">
            {pageNumbers.map((page, index) =>
              typeof page === 'string' ? (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 text-gray-400"
                  aria-hidden="true"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={page}
                  variant={currentPage === page ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => onPageChange(page)}
                  aria-label={`Página ${page}`}
                  aria-current={currentPage === page ? 'page' : undefined}
                >
                  {page}
                </Button>
              )
            )}
          </div>
        )}

        {/* Next button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          aria-label="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* Page info */}
        <span className="ml-2 text-sm text-gray-500">
          Página {currentPage} de {totalPages}
        </span>
      </nav>
    );
  }
);

Pagination.displayName = 'Pagination';

// Simple pagination info component
interface PaginationInfoProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  className?: string;
}

export function PaginationInfo({
  currentPage,
  pageSize,
  totalItems,
  className,
}: PaginationInfoProps): JSX.Element {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <span className={cn('text-sm text-gray-500', className)}>
      {totalItems > 0 ? `${start}-${end}` : '0'} de {totalItems} resultados
    </span>
  );
}
