import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DailyGoalSettings } from '@shared/schema';
import {
  validateTacticsMinutes,
  validateGamesCount,
  validateStudyMinutes,
  hasActiveGoals,
  DAILY_GOAL_LIMITS,
} from './utils';
import { offlineStorage } from './offline-storage';

// Mock IndexedDB for testing
const mockIndexedDB = {
  open: vi.fn(),
};

// Mock the offline storage module to avoid IndexedDB issues
vi.mock('./offline-storage', () => ({
  offlineStorage: {
    getDailyGoalSettings: vi.fn(),
    setDailyGoalSettings: vi.fn(),
    clearDailyGoalSettings: vi.fn(),
  },
}));

// Mock window.indexedDB
Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

describe('Daily Goals Data Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any stored data
    try {
      await offlineStorage.clearDailyGoalSettings();
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('Validation Functions', () => {
    describe('validateTacticsMinutes', () => {
      it('should validate valid tactics minutes', () => {
        expect(validateTacticsMinutes(30)).toEqual({ isValid: true });
        expect(validateTacticsMinutes(0)).toEqual({ isValid: true });
        expect(validateTacticsMinutes(99)).toEqual({ isValid: true });
      });

      it('should reject invalid tactics minutes', () => {
        expect(validateTacticsMinutes(-1)).toEqual({
          isValid: false,
          error: 'Tactics minutes must be at least 0',
        });
        expect(validateTacticsMinutes(100)).toEqual({
          isValid: false,
          error: 'Tactics minutes cannot exceed 99',
        });
        expect(validateTacticsMinutes(30.5)).toEqual({
          isValid: false,
          error: 'Tactics minutes must be a whole number',
        });
      });
    });

    describe('validateGamesCount', () => {
      it('should validate valid games count', () => {
        expect(validateGamesCount(5)).toEqual({ isValid: true });
        expect(validateGamesCount(0)).toEqual({ isValid: true });
        expect(validateGamesCount(99)).toEqual({ isValid: true });
      });

      it('should reject invalid games count', () => {
        expect(validateGamesCount(-1)).toEqual({
          isValid: false,
          error: 'Games count must be at least 0',
        });
        expect(validateGamesCount(100)).toEqual({
          isValid: false,
          error: 'Games count cannot exceed 99',
        });
        expect(validateGamesCount(5.5)).toEqual({
          isValid: false,
          error: 'Games count must be a whole number',
        });
      });
    });

    describe('validateStudyMinutes', () => {
      it('should validate valid study minutes', () => {
        expect(validateStudyMinutes(45)).toEqual({ isValid: true });
        expect(validateStudyMinutes(0)).toEqual({ isValid: true });
        expect(validateStudyMinutes(99)).toEqual({ isValid: true });
      });

      it('should reject invalid study minutes', () => {
        expect(validateStudyMinutes(-1)).toEqual({
          isValid: false,
          error: 'Study minutes must be at least 0',
        });
        expect(validateStudyMinutes(100)).toEqual({
          isValid: false,
          error: 'Study minutes cannot exceed 99',
        });
        expect(validateStudyMinutes(45.5)).toEqual({
          isValid: false,
          error: 'Study minutes must be a whole number',
        });
      });
    });

    describe('hasActiveGoals', () => {
      it('should return true when there are active goals', () => {
        const settings: DailyGoalSettings = {
          tacticsMinutes: 30,
          gamesCount: 0,
          studyMinutes: 0,
          isCustomized: true,
        };
        expect(hasActiveGoals(settings)).toBe(true);
      });

      it('should return false when there are no active goals', () => {
        const settings: DailyGoalSettings = {
          tacticsMinutes: 0,
          gamesCount: 0,
          studyMinutes: 0,
          isCustomized: true,
        };
        expect(hasActiveGoals(settings)).toBe(false);
      });

      it('should return false for null/undefined settings', () => {
        expect(hasActiveGoals(null)).toBe(false);
        expect(hasActiveGoals(undefined)).toBe(false);
      });
    });
  });

  describe('Constants', () => {
    it('should have correct daily goal limits', () => {
      expect(DAILY_GOAL_LIMITS.tacticsMinutes).toEqual({ min: 0, max: 99 });
      expect(DAILY_GOAL_LIMITS.gamesCount).toEqual({ min: 0, max: 99 });
      expect(DAILY_GOAL_LIMITS.studyMinutes).toEqual({ min: 0, max: 99 });
    });
  });
});
