import { useState } from 'react';
import { format } from 'date-fns';
import type { TrainingSession } from '@shared/schema';

/**
 * Manages the session date (Date object + raw yyyy-MM-dd input string) for the game modal.
 * Pure state extraction — no behavior change from the original inline useState fields.
 */
export function useDateField(editingSession?: TrainingSession) {
  const initialDate = editingSession?.date ? new Date(editingSession.date) : new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [dateInput, setDateInput] = useState<string>(format(initialDate, 'yyyy-MM-dd'));

  const isDateValid =
    /^\d{4}-\d{2}-\d{2}$/.test(dateInput) &&
    !Number.isNaN(selectedDate.getTime()) &&
    selectedDate <= new Date();

  /** Set both the Date and the formatted input string. */
  const setDate = (date: Date) => {
    setSelectedDate(date);
    setDateInput(format(date, 'yyyy-MM-dd'));
  };

  /** Handle a raw value from the native date input, parsing it locally. */
  const handleDateInputChange = (value: string) => {
    setDateInput(value);
    const [year, month, day] = value.split('-').map(Number);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) {
        setSelectedDate(parsed);
      }
    }
  };

  return { selectedDate, dateInput, isDateValid, setDate, handleDateInputChange };
}
