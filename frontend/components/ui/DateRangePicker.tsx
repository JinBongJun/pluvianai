'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { clsx } from 'clsx';
import Button from './Button';

type Preset = {
  label: string;
  getRange: () => { from: Date | null; to: Date | null };
};

interface DateRangePickerProps {
  value?: { from: Date | null; to: Date | null };
  onChange: (range: { from: Date | null; to: Date | null }) => void;
  presets?: Preset[];
  className?: string;
  showPeriodLabel?: boolean; // Show "Period:" label or not
}

const defaultPresets = [
  {
    label: 'Last 7 days',
    getRange: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    },
  },
  {
    label: 'Last 30 days',
    getRange: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    },
  },
  {
    label: 'Last month',
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from, to };
    },
  },
  {
    label: 'Last 6 months',
    getRange: () => {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    },
  },
  {
    label: 'Custom range',
    getRange: () => {
      // Custom range doesn't set dates, user selects manually
      return { from: null, to: null };
    },
  },
];

export default function DateRangePicker({
  value,
  onChange,
  presets,
  className,
  showPeriodLabel = true,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selecting, setSelecting] = useState<'from' | 'to'>('from');
  const [tempFrom, setTempFrom] = useState<Date | null>(value?.from || null);
  const [tempTo, setTempTo] = useState<Date | null>(value?.to || null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate dropdown position
  const calculateDropdownPosition = () => {
    if (containerRef.current && typeof window !== 'undefined') {
      const rect = containerRef.current.getBoundingClientRect();
      
      // Check if dropdown would go off screen and adjust
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dropdownWidth = 700; // Wider for side-by-side layout
      const dropdownHeight = 500; // Adjusted height
      
      // Position directly below the button, aligned to the left edge
      // getBoundingClientRect already accounts for scroll, so we don't need to add scroll offset for fixed positioning
      let left = rect.left; // Align left edge of dropdown with left edge of button
      let top = rect.bottom + 1; // Position directly below button with minimal gap
      
      // Adjust if dropdown would go off right edge (but keep left alignment if possible)
      if (left + dropdownWidth > viewportWidth - 8) {
        // Only shift left if absolutely necessary, try to maintain button alignment
        const availableSpace = viewportWidth - left - 8;
        if (availableSpace < dropdownWidth) {
          left = Math.max(8, viewportWidth - dropdownWidth - 8);
        }
      }
      
      // Adjust if dropdown would go off bottom edge
      if (top + dropdownHeight > viewportHeight - 8) {
        // Try to show above button instead
        const topAbove = rect.top - dropdownHeight - 1;
        if (topAbove >= 8) {
          top = topAbove;
        } else {
          // If still off screen, position at top of viewport but maintain left alignment
          top = 8;
        }
      }
      
      // Ensure dropdown doesn't go off left edge (minimum 8px from edge)
      if (left < 8) {
        left = 8;
      }
      
      // Ensure dropdown doesn't go off top edge
      if (top < 8) {
        top = 8;
      }
      
      // getBoundingClientRect returns viewport-relative coordinates, perfect for fixed positioning
      setDropdownPosition({ 
        top: top, 
        left: left 
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTempFrom(value?.from || null);
      setTempTo(value?.to || null);
      // Reset selecting state based on current values
      if (value?.from && !value?.to) {
        setSelecting('to');
      } else {
        setSelecting('from');
      }
      
      // Calculate initial position with a small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        calculateDropdownPosition();
      }, 0);
      
      // Recalculate on scroll and resize
      const handleScroll = () => {
        calculateDropdownPosition();
      };
      
      const handleResize = () => {
        calculateDropdownPosition();
      };
      
      // Use capture phase and add to all scrollable containers
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      document.addEventListener('scroll', handleScroll, true);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('scroll', handleScroll, true);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [isOpen, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is inside the button container
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      
      // Check if click is inside the dropdown portal (by class name)
      const dropdownElement = document.querySelector('[data-datepicker-dropdown]');
      if (dropdownElement && dropdownElement.contains(target)) {
        return;
      }
      
      // Click is outside both button and dropdown, close it
      setIsOpen(false);
    };

    if (isOpen) {
      // Use setTimeout to avoid immediate close on button click
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDisplay = () => {
    if (!value?.from && !value?.to) return 'Select date range';
    if (value.from && value.to) {
      // Format as "Jan 04 - Jan 10" style
      const fromStr = value.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const toStr = value.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${fromStr} - ${toStr}`;
    }
    if (value.from) return `From ${formatDate(value.from)}`;
    return `To ${formatDate(value.to)}`;
  };

  const getActivePresetLabel = () => {
    for (const preset of (presets || defaultPresets)) {
      if (isPresetActive(preset)) {
        return preset.label;
      }
    }
    return null;
  };

  const formatPeriodDisplay = () => {
    const presetLabel = getActivePresetLabel();
    if (presetLabel && presetLabel !== 'Custom range') {
      if (value?.from && value?.to) {
        const fromStr = value.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const toStr = value.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${presetLabel} (${fromStr} - ${toStr})`;
      }
      return presetLabel;
    }
    if (value?.from && value?.to) {
      const fromStr = value.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const toStr = value.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `Custom (${fromStr} - ${toStr})`;
    }
    return 'Select date range';
  };

  const handleDateClick = (date: Date) => {
    const clickedDate = new Date(date);
    clickedDate.setHours(0, 0, 0, 0);
    
    // If no dates selected, start with 'from'
    if (!tempFrom && !tempTo) {
      setTempFrom(clickedDate);
      setSelecting('to');
      return;
    }
    
    // If only 'from' is selected
    if (tempFrom && !tempTo) {
      if (clickedDate < tempFrom) {
        // Clicked date is before 'from', swap them
        const newTo = new Date(tempFrom);
        newTo.setHours(23, 59, 59, 999);
        setTempTo(newTo);
        setTempFrom(clickedDate);
        setSelecting('from');
      } else {
        // Clicked date is after 'from', set as 'to'
        const newTo = new Date(clickedDate);
        newTo.setHours(23, 59, 59, 999);
        setTempTo(newTo);
        setSelecting('from');
      }
      return;
    }
    
    // If both are selected, start fresh
    if (tempFrom && tempTo) {
      setTempFrom(clickedDate);
      setTempTo(null);
      setSelecting('to');
      return;
    }
  };

  const handleApply = () => {
    onChange({ from: tempFrom, to: tempTo });
    setIsOpen(false);
  };

  const handleClear = () => {
    setTempFrom(null);
    setTempTo(null);
    onChange({ from: null, to: null });
  };

  const handlePreset = (preset: Preset) => {
    const range = preset.getRange();
    if (preset.label === 'Custom range') {
      // For custom range, just reset and let user select manually
      setTempFrom(null);
      setTempTo(null);
      setSelecting('from');
    } else {
      setTempFrom(range.from);
      setTempTo(range.to);
      onChange(range);
      setIsOpen(false);
    }
  };

  const isPresetActive = (preset: Preset) => {
    if (!value?.from || !value?.to) {
      // If custom range preset, check if dates exist but don't match any preset
      if (preset.label === 'Custom range') {
        return false; // Don't highlight custom range even if dates exist
      }
      return false;
    }
    const range = preset.getRange();
    if (!range.from || !range.to) {
      // Custom range
      return false;
    }
    if (preset.label === 'Custom range') return false; // Custom range is never "active"
    
    const valueFrom = new Date(value.from);
    const valueTo = new Date(value.to);
    const presetFrom = new Date(range.from);
    const presetTo = new Date(range.to);
    
    valueFrom.setHours(0, 0, 0, 0);
    valueTo.setHours(0, 0, 0, 0);
    presetFrom.setHours(0, 0, 0, 0);
    presetTo.setHours(0, 0, 0, 0);
    
    return valueFrom.getTime() === presetFrom.getTime() && 
           valueTo.getTime() === presetTo.getTime();
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isDateInRange = (date: Date) => {
    if (!tempFrom) return false;
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    
    if (tempTo) {
      const fromOnly = new Date(tempFrom);
      fromOnly.setHours(0, 0, 0, 0);
      const toOnly = new Date(tempTo);
      toOnly.setHours(0, 0, 0, 0);
      return dateOnly >= fromOnly && dateOnly <= toOnly;
    }
    
    // If only 'from' is selected, highlight it
    const fromOnly = new Date(tempFrom);
    fromOnly.setHours(0, 0, 0, 0);
    return dateOnly.getTime() === fromOnly.getTime();
  };

  const isDateSelected = (date: Date) => {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    
    if (tempFrom) {
      const fromOnly = new Date(tempFrom);
      fromOnly.setHours(0, 0, 0, 0);
      if (dateOnly.getTime() === fromOnly.getTime()) return true;
    }
    
    if (tempTo) {
      const toOnly = new Date(tempTo);
      toOnly.setHours(0, 0, 0, 0);
      if (dateOnly.getTime() === toOnly.getTime()) return true;
    }
    
    return false;
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days: (Date | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    return (
      <div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map((day) => (
            <div key={day} className="text-xs font-medium text-gray-500 text-center py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="h-8" />;
            }

            const isInRange = isDateInRange(date);
            const isSelected = isDateSelected(date);
            const isFrom = tempFrom && date.toDateString() === tempFrom.toDateString();
            const isTo = tempTo && date.toDateString() === tempTo.toDateString();
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <button
                key={date.toISOString()}
                onClick={() => handleDateClick(date)}
                className={clsx(
                  'h-8 w-8 rounded text-sm transition-all duration-150 relative flex items-center justify-center',
                  isFrom || isTo
                    ? 'bg-gray-900 text-white font-medium rounded-md'
                    : isInRange
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50',
                  isToday && !isSelected && !isInRange && 'font-medium ring-2 ring-blue-400 ring-opacity-50'
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <>
      <div ref={containerRef} className={clsx('relative', className)}>
        <button
          onClick={handleButtonClick}
          className="flex items-center justify-between gap-2 px-3 py-2 border border-white/10 bg-white/5 rounded-md text-sm text-white hover:bg-white/10 transition-colors min-w-[280px]"
        >
          <span className="flex items-center gap-2 flex-1">
            {showPeriodLabel && <span className="text-slate-400">Period:</span>}
            <span className="font-medium text-left flex-1">{formatPeriodDisplay()}</span>
          </span>
          <svg
            className={clsx(
              'h-4 w-4 text-slate-400 transition-transform flex-shrink-0',
              isOpen && 'transform rotate-180'
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      {typeof window !== 'undefined' && isOpen && dropdownPosition && createPortal(
        <div 
          data-datepicker-dropdown
          className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden animate-fade-in" 
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
            width: '700px',
            zIndex: 999999,
            pointerEvents: 'auto',
          }}
        >
          <div className="flex">
            {/* Left Panel - Presets */}
            <div className="w-48 border-r border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-500 mb-2">Quick Select</div>
              <div className="space-y-1">
                {(presets || defaultPresets).map((preset, index) => {
                  const isActive = isPresetActive(preset);
                  return (
                    <button
                      key={index}
                      onClick={() => handlePreset(preset)}
                      className={clsx(
                        'w-full text-left px-3 py-2 text-sm rounded transition-colors',
                        isActive
                          ? 'bg-blue-500 text-white font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Calendar */}
            <div className="flex-1 p-6 bg-white">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => {
                    const prev = new Date(currentMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setCurrentMonth(prev);
                  }}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="font-semibold text-gray-900">
                  {currentMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                </div>
                <button
                  onClick={() => {
                    const next = new Date(currentMonth);
                    next.setMonth(next.getMonth() + 1);
                    setCurrentMonth(next);
                  }}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              {renderCalendar()}
              
              {/* Actions */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleClear}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Clear
                </button>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleApply}>Apply</Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

