'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';
import { clsx } from 'clsx';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  className,
}: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className={clsx('flex items-center justify-between', className)}>
      <div className="flex items-center gap-4">
        <div className="text-sm text-ag-muted">
          Showing <span className="font-medium">{startItem}</span> to{' '}
          <span className="font-medium">{endItem}</span> of{' '}
          <span className="font-medium">{totalItems}</span> results
        </div>
        {onItemsPerPageChange && (
          <div className="flex items-center gap-2">
            <label className={clsx(
              'text-sm',
              className?.includes('bg-transparent') ? 'text-ag-muted' : 'text-ag-muted'
            )}>Per page:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className={clsx(
                'text-sm rounded-md',
                className?.includes('bg-transparent')
                  ? 'bg-white/5 border-white/10 text-ag-text focus:ring-ag-accent focus:border-ag-accent'
                  : 'border-white/10 bg-ag-surface text-ag-text focus:ring-ag-accent focus:border-ag-accent'
              )}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => {
            if (page === '...') {
              return (
                <span 
                  key={`ellipsis-${index}`} 
                  className={clsx(
                    'px-2',
                    className?.includes('bg-transparent') ? 'text-ag-muted' : 'text-ag-muted'
                  )}
                >
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={clsx(
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  currentPage === pageNum
                    ? className?.includes('bg-transparent')
                      ? 'bg-ag-primary/20 text-ag-text border border-ag-accent/50'
                      : 'bg-ag-surface text-ag-text'
                    : className?.includes('bg-transparent')
                      ? 'text-ag-muted hover:bg-white/10 hover:text-ag-text border border-white/10'
                      : 'text-ag-muted hover:bg-white/5'
                )}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <Button
          variant="secondary"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
