import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { Calendar, Clock, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo',
  'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai', 'Australia/Sydney'
];

export const SchedulePicker = ({ value, onChange, disabled = false }) => {
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const handleDateChange = (date) => {
    if (date) {
      onChange(date.toISOString());
    } else {
      onChange(null);
    }
  };

  const selectedDate = value ? new Date(value) : null;
  const minDate = new Date();

  return (
    <div className="space-y-4 sm:space-y-5">
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
    {/* Date Picker */}
    <div className="space-y-1.5 sm:space-y-2">
      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-500" />
        Date
      </label>
      <DatePicker
        selected={selectedDate}
        onChange={handleDateChange}
        minDate={minDate}
        dateFormat="MMMM d, yyyy"
        disabled={disabled}
        withPortal // <--- ADDED THIS: Opens calendar as a centered modal on mobile
        className={cn(
          'w-full h-12 sm:h-11 px-4 rounded-xl bg-slate-50 border-2 border-transparent transition-colors',
          'focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10',
          'font-medium text-base sm:text-sm text-slate-700',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        placeholderText="Select date"
      />
    </div>

    {/* Time Picker */}
    <div className="space-y-1.5 sm:space-y-2">
      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
        <Clock className="w-4 h-4 text-slate-500" />
        Time
      </label>
      <DatePicker
        selected={selectedDate}
        onChange={handleDateChange}
        showTimeSelect
        showTimeSelectOnly
        timeIntervals={15}
        timeCaption="Time"
        dateFormat="h:mm aa"
        disabled={disabled}
        withPortal // <--- ADDED THIS: Opens time list as a centered modal on mobile
        className={cn(
          'w-full h-12 sm:h-11 px-4 rounded-xl bg-slate-50 border-2 border-transparent transition-colors',
          'focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10',
          'font-medium text-base sm:text-sm text-slate-700',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        placeholderText="Select time"
      />
    </div>
  </div>

  {/* Timezone Selector (Remains the same, already mobile-optimized) */}
  <div className="space-y-1.5 sm:space-y-2">
    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
      <Globe className="w-4 h-4 text-slate-500" />
      Timezone
    </label>
    <select
      value={timezone}
      onChange={(e) => setTimezone(e.target.value)}
      disabled={disabled}
      className={cn(
        'w-full h-12 sm:h-11 px-4 rounded-xl bg-slate-50 border-2 border-transparent transition-colors cursor-pointer appearance-none',
        'focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10',
        'font-medium text-base sm:text-sm text-slate-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='https://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
        backgroundPosition: 'right 0.5rem center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '1.5em 1.5em'
      }}
    >
      {TIMEZONES.map((tz) => (
        <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
      ))}
    </select>
  </div>

  {/* Preview (Remains the same, already mobile-optimized) */}
  {selectedDate && (
    <div className="p-3 sm:p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex items-start sm:items-center gap-3">
      <div className="mt-0.5 sm:mt-0 p-1.5 bg-indigo-100 rounded-lg shrink-0">
        <Calendar className="w-4 h-4 text-indigo-600" />
      </div>
      <p className="text-sm font-medium text-indigo-800 leading-snug">
        Will post on <span className="font-bold">{format(selectedDate, "EEEE, MMMM d")}</span> at <span className="font-bold">{format(selectedDate, "h:mm a")}</span>
        <span className="block sm:inline sm:ml-1 text-indigo-600/80 text-xs sm:text-sm">({timezone})</span>
      </p>
    </div>
  )}
</div>
  );
};

export default SchedulePicker;
