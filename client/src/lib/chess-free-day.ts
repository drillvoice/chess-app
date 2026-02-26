function startOfLocalDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export interface ChessFreeDayWindow {
  minDate: Date;
  maxDate: Date;
  minDateKey: string;
  maxDateKey: string;
}

export function getChessFreeDayWindow(now: Date = new Date()): ChessFreeDayWindow {
  const minDate = startOfLocalDay(now);
  const maxDate = new Date(minDate);
  maxDate.setDate(maxDate.getDate() + 7);

  return {
    minDate,
    maxDate,
    minDateKey: toLocalDateKey(minDate),
    maxDateKey: toLocalDateKey(maxDate),
  };
}

export function isDateWithinChessFreeDayWindow(date: Date, now: Date = new Date()): boolean {
  const target = startOfLocalDay(date).getTime();
  const { minDate, maxDate } = getChessFreeDayWindow(now);
  return target >= minDate.getTime() && target <= maxDate.getTime();
}

export function isDateKeyWithinChessFreeDayWindow(
  dateKey: string,
  now: Date = new Date(),
): boolean {
  const parsed = parseLocalDateKey(dateKey);
  if (!parsed) return false;
  return isDateWithinChessFreeDayWindow(parsed, now);
}

export interface ChessFreeDayStatus {
  minDateKey: string;
  maxDateKey: string;
  todayDateKey: string;
  selectedDateKey?: string;
  selectedDate?: Date;
  isValidSelection: boolean;
  isTodayCfd: boolean;
  needsCfdNomination: boolean;
}

export function getChessFreeDayStatus(
  chessFreeDayDate: string | undefined,
  now: Date = new Date(),
): ChessFreeDayStatus {
  const { minDateKey, maxDateKey } = getChessFreeDayWindow(now);
  const todayDateKey = toLocalDateKey(startOfLocalDay(now));

  const parsed = chessFreeDayDate ? parseLocalDateKey(chessFreeDayDate) : null;
  const isValidSelection = Boolean(parsed && isDateWithinChessFreeDayWindow(parsed, now));

  const selectedDateKey = isValidSelection && parsed ? toLocalDateKey(parsed) : undefined;
  const selectedDate = isValidSelection && parsed ? parsed : undefined;
  const isTodayCfd = Boolean(selectedDateKey && selectedDateKey === todayDateKey);

  return {
    minDateKey,
    maxDateKey,
    todayDateKey,
    selectedDateKey,
    selectedDate,
    isValidSelection,
    isTodayCfd,
    needsCfdNomination: !isValidSelection,
  };
}
