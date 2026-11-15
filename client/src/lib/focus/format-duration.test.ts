import { describe, expect, it } from 'vitest';
import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [75_000, '1:15'],
    [600_000, '10:00'],
    [3_725_000, '1:02:05'],
    [-5, '0:00'],
    [NaN, '0:00'],
    [Infinity, '0:00'],
  ])('%s ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
