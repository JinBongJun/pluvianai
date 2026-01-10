'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className,
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Calculate dropdown position
  const calculatePosition = () => {
    if (buttonRef.current && typeof window !== 'undefined') {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = Math.min(options.length * 40 + 16, 300); // Max 300px height
      const viewportHeight = window.innerHeight;
      
      let top = buttonRect.bottom + 4;
      let left = buttonRect.left;
      
      // If dropdown would go off bottom, show above instead
      if (top + dropdownHeight > viewportHeight - 8) {
        const topAbove = buttonRect.top - dropdownHeight - 4;
        if (topAbove >= 8) {
          top = topAbove;
        } else {
          top = 8;
        }
      }
      
      // Adjust if dropdown would go off right edge
      const dropdownWidth = Math.max(buttonRect.width, 200);
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - dropdownWidth - 8);
      }
      
      // Ensure dropdown doesn't go off left edge
      if (left < 8) {
        left = 8;
      }
      
      setDropdownPosition({ top, left });
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Calculate position after a short delay to ensure DOM is ready
      const timer = setTimeout(() => {
        calculatePosition();
      }, 0);
      
      // Recalculate on scroll and resize
      const handleScroll = () => calculatePosition();
      const handleResize = () => calculatePosition();
      
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [isOpen, options.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      
      const dropdownElement = document.querySelector('[data-select-dropdown]');
      if (dropdownElement && dropdownElement.contains(target)) {
        return;
      }
      
      setIsOpen(false);
    };

    if (isOpen) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleOptionClick = (optionValue: string | null) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'flex items-center justify-between gap-2 px-3 py-2 border border-white/10 bg-white/5 rounded-md text-sm text-white hover:bg-white/10 transition-colors min-w-[200px]',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'border-white/20 bg-white/10'
        )}
      >
        <span className="flex-1 text-left truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={clsx(
            'h-4 w-4 text-slate-400 transition-transform flex-shrink-0',
            isOpen && 'transform rotate-180'
          )}
        />
      </button>

      {typeof window !== 'undefined' && isOpen && dropdownPosition && createPortal(
        <div
          data-select-dropdown
          className="fixed bg-[#0B0C15] rounded-lg shadow-2xl border border-white/20 overflow-hidden z-[999999] animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            minWidth: buttonRef.current?.offsetWidth || 200,
            maxHeight: '300px',
            pointerEvents: 'auto',
          }}
        >
          <div className="overflow-y-auto max-h-[300px] py-1">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleOptionClick(option.value)}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2',
                    isSelected
                      ? 'bg-purple-500/20 text-white font-medium'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
