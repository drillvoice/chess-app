import { describe, expect, it } from 'vitest';
import {
  getChessFreeDayStatus,
  getChessFreeDayWindow,
  isDateKeyWithinChessFreeDayWindow,
  parseLocalDateKey,
  toLocalDateKey,
} from './chess-free-day';

describe('chess-free-day helpers', () => {
  const fixedNow = new Date(2026, 0, 10, 14, 30, 0);

  it('formats local date keys as YYYY-MM-DD', () => {
    expect(toLocalDateKey(new Date(2026, 3, 5))).toBe('2026-04-05');
  });

  it('parses valid date keys and rejects malformed values', () => {
    expect(parseLocalDateKey('2026-01-10')).toEqual(new Date(2026, 0, 10));
    expect(parseLocalDateKey('2026-13-10')).toBeNull();
    expect(parseLocalDateKey('2026-02-30')).toBeNull();
    expect(parseLocalDateKey('invalid')).toBeNull();
  });

  it('validates date keys in the inclusive today + 7 day window', () => {
    const { minDateKey, maxDateKey } = getChessFreeDayWindow(fixedNow);

    expect(minDateKey).toBe('2026-01-10');
    expect(maxDateKey).toBe('2026-01-17');
    expect(isDateKeyWithinChessFreeDayWindow('2026-01-10', fixedNow)).toBe(true);
    expect(isDateKeyWithinChessFreeDayWindow('2026-01-17', fixedNow)).toBe(true);
    expect(isDateKeyWithinChessFreeDayWindow('2026-01-18', fixedNow)).toBe(false);
    expect(isDateKeyWithinChessFreeDayWindow('2026-01-09', fixedNow)).toBe(false);
  });

  it('derives isTodayCfd when selected date is today', () => {
    const status = getChessFreeDayStatus('2026-01-10', fixedNow);
    expect(status.isValidSelection).toBe(true);
    expect(status.isTodayCfd).toBe(true);
    expect(status.needsCfdNomination).toBe(false);
    expect(status.selectedDateKey).toBe('2026-01-10');
  });

  it('marks expired or invalid values as needing nomination', () => {
    const expired = getChessFreeDayStatus('2026-01-01', fixedNow);
    expect(expired.isValidSelection).toBe(false);
    expect(expired.needsCfdNomination).toBe(true);
    expect(expired.selectedDateKey).toBeUndefined();

    const malformed = getChessFreeDayStatus('bad-date', fixedNow);
    expect(malformed.isValidSelection).toBe(false);
    expect(malformed.needsCfdNomination).toBe(true);
    expect(malformed.selectedDateKey).toBeUndefined();
  });
});
