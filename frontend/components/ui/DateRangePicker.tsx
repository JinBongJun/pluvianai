import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { clsx } from 'clsx';

export interface DateRangePickerProps {
    value?: { from: Date | null; to: Date | null };
    onChange?: (value: { from: Date | null; to: Date | null }) => void;
    placeholder?: string;
    className?: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
    value = { from: null, to: null },
    onChange,
    className = '',
}) => {
    const formatDate = (date: Date | null) => {
        if (!date) return '';
        return date.toISOString().split('T')[0];
    };

    const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value ? new Date(e.target.value) : null;
        onChange?.({ ...value, from: date });
    };

    const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value ? new Date(e.target.value) : null;
        onChange?.({ ...value, to: date });
    };

    return (
        <div className={clsx('flex items-center gap-3', className)}>
            <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                    type="date"
                    value={formatDate(value.from)}
                    onChange={handleFromChange}
                    className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all [color-scheme:dark]"
                />
            </div>
            <span className="text-slate-400">to</span>
            <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                    type="date"
                    value={formatDate(value.to)}
                    onChange={handleToChange}
                    className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all [color-scheme:dark]"
                />
            </div>
        </div>
    );
};

export default DateRangePicker;
