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
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Date Picker */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Date
          </label>
          <DatePicker
            selected={selectedDate}
            onChange={handleDateChange}
            minDate={minDate}
            dateFormat="MMMM d, yyyy"
            disabled={disabled}
            className={cn(
              'w-full h-12 px-4 rounded-xl bg-slate-50 border-2 border-transparent',
              'focus:bg-white focus:border-indigo-500 focus:outline-none',
              'font-medium text-slate-700',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            placeholderText="Select date"
          />
        </div>

        {/* Time Picker */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4" />
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
            className={cn(
              'w-full h-12 px-4 rounded-xl bg-slate-50 border-2 border-transparent',
              'focus:bg-white focus:border-indigo-500 focus:outline-none',
              'font-medium text-slate-700',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            placeholderText="Select time"
          />
        </div>
      </div>

      {/* Timezone Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={disabled}
          className={cn(
            'w-full h-12 px-4 rounded-xl bg-slate-50 border-2 border-transparent',
            'focus:bg-white focus:border-indigo-500 focus:outline-none',
            'font-medium text-slate-700',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Preview */}
      {selectedDate && (
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
          <p className="text-sm font-medium text-indigo-700">
            Will post on {format(selectedDate, "EEEE, MMMM d")} at {format(selectedDate, "h:mm a")} ({timezone})
          </p>
        </div>
      )}
    </div>
  );
};

export default SchedulePicker;
