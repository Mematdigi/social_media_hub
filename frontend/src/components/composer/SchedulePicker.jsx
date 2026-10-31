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
      <label className="text-[0.8125rem] font-semibold text-slate-700 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-400" />
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
          'w-full h-11 px-3.5 rounded-xl bg-white border border-slate-200 shadow-sm transition-[border-color,box-shadow]',
          'hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15',
          'font-medium text-base sm:text-sm text-slate-800 placeholder:text-slate-400',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        placeholderText="Select date"
      />
    </div>

    {/* Time Picker */}
    <div className="space-y-1.5 sm:space-y-2">
      <label className="text-[0.8125rem] font-semibold text-slate-700 flex items-center gap-2">
        <Clock className="w-4 h-4 text-slate-400" />
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
          'w-full h-11 px-3.5 rounded-xl bg-white border border-slate-200 shadow-sm transition-[border-color,box-shadow]',
          'hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15',
          'font-medium text-base sm:text-sm text-slate-800 placeholder:text-slate-400',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        placeholderText="Select time"
      />
    </div>
  </div>

  {/* Timezone Selector (Remains the same, already mobile-optimized) */}
  <div className="space-y-1.5 sm:space-y-2">
    <label className="text-[0.8125rem] font-semibold text-slate-700 flex items-center gap-2">
      <Globe className="w-4 h-4 text-slate-400" />
      Timezone
    </label>
    <select
      value={timezone}
      onChange={(e) => setTimezone(e.target.value)}
      disabled={disabled}
      className={cn(
        'w-full h-11 pl-3.5 pr-10 rounded-xl bg-white border border-slate-200 shadow-sm transition-[border-color,box-shadow] cursor-pointer appearance-none',
        'hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15',
        'font-medium text-base sm:text-sm text-slate-800',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
        backgroundPosition: 'right 0.625rem center',
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
    <div className="p-3 sm:p-4 rounded-xl bg-white border border-indigo-200 ring-4 ring-indigo-500/5 flex items-start sm:items-center gap-3">
      <div className="mt-0.5 sm:mt-0 w-8 h-8 inline-flex items-center justify-center bg-indigo-50 ring-1 ring-inset ring-indigo-100 rounded-lg shrink-0">
        <Calendar className="w-4 h-4 text-indigo-600" />
      </div>
      <p className="text-sm font-medium text-slate-700 leading-snug">
        Will post on <span className="font-semibold text-slate-900">{format(selectedDate, "EEEE, MMMM d")}</span> at <span className="font-semibold text-slate-900">{format(selectedDate, "h:mm a")}</span>
        <span className="block sm:inline sm:ml-1 text-slate-400 text-xs sm:text-sm">({timezone})</span>
      </p>
    </div>
  )}
</div>
  );
};

export default SchedulePicker;
