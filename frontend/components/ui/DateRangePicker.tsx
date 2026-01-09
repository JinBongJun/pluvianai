'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { clsx } from 'clsx';
import Button from './Button';

type Preset = {
  label: string;
  getRange: () => { from: Date; to: Date };
};

interface DateRangePickerProps {
  value?: { from: Date | null; to: Date | null };
  onChange: (range: { from: Date | null; to: Date | null }) => void;
  presets?: Preset[];
  className?: string;
}

const defaultPresets = [
  {
    label: 'Today',
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { from: today, to: new Date() };
    },
  },
  {
    label: 'Yesterday',
    getRange: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const end = new Date(yesterday);
      end.setHours(23, 59, 59, 999);
      return { from: yesterday, to: end };
    },
  },
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
    label: 'This month',
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now };
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
];

export default function DateRangePicker({
  value,
  onChange,
  presets,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selecting, setSelecting] = useState<'from' | 'to'>('from');
  const [tempFrom, setTempFrom] = useState<Date | null>(value?.from || null);
  const [tempTo, setTempTo] = useState<Date | null>(value?.to || null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

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
    }
  }, [isOpen, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
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
      return `${formatDate(value.from)} - ${formatDate(value.to)}`;
    }
    if (value.from) return `From ${formatDate(value.from)}`;
    return `To ${formatDate(value.to)}`;
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
    setTempFrom(range.from);
    setTempTo(range.to);
    onChange(range);
    setIsOpen(false);
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

    return (
      <div className="grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-xs font-medium text-slate-400 text-center py-2">
            {day}
          </div>
        ))}
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="h-8" />;
          }

          const isInRange = isDateInRange(date);
          const isSelected = isDateSelected(date);
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <button
              key={date.toISOString()}
              onClick={() => handleDateClick(date)}
              className={clsx(
                'h-8 w-8 rounded-md text-sm transition-all duration-150',
                isSelected
                  ? 'bg-purple-500 text-white scale-110 shadow-lg shadow-purple-500/50'
                  : isInRange
                  ? 'bg-purple-500/20 text-white hover:bg-purple-500/30'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white hover:scale-105',
                isToday && 'ring-2 ring-purple-500'
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 border border-white/10 bg-white/5 rounded-md text-sm text-white hover:bg-white/10 transition-colors"
      >
        <Calendar className="h-4 w-4" />
        <span>{formatDisplay()}</span>
        {value?.from || value?.to ? (
          <X
            className="h-4 w-4 text-slate-400 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          />
        ) : null}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-[#0B0C15] rounded-lg shadow-2xl border border-white/10 z-[9999] p-4 w-96 max-h-[600px] overflow-y-auto animate-fade-in">
          {/* Presets */}
          <div className="mb-4 pb-4 border-b border-white/10">
            <div className="text-xs font-medium text-white mb-2">Quick Select</div>
            <div className="grid grid-cols-2 gap-2">
              {(presets || defaultPresets).map((preset, index) => (
                <button
                  key={index}
                  onClick={() => handlePreset(preset)}
                  className="text-xs px-2 py-1 text-slate-300 hover:bg-white/10 hover:text-white rounded text-left transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  const prev = new Date(currentMonth);
                  prev.setMonth(prev.getMonth() - 1);
                  setCurrentMonth(prev);
                }}
                className="p-1 hover:bg-white/10 rounded text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="font-medium text-white">
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <button
                onClick={() => {
                  const next = new Date(currentMonth);
                  next.setMonth(next.getMonth() + 1);
                  setCurrentMonth(next);
                }}
                className="p-1 hover:bg-white/10 rounded text-white transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {renderCalendar()}
          </div>

          {/* Selected Range Display */}
          <div className="mb-4 p-3 bg-white/5 rounded text-sm border border-white/10">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-xs text-slate-400 mb-1">From</div>
                <div className="font-medium text-white">
                  {tempFrom ? formatDate(tempFrom) : 'Not selected'}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-slate-400 mb-1">To</div>
                <div className="font-medium text-white">
                  {tempTo ? formatDate(tempTo) : 'Not selected'}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleClear}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Clear
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleApply}>Apply</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

