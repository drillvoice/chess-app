import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SessionAnalyzer, DailyGoalProgress, ProgressFormatter } from '@/lib/daily-goals-progress';
import { useDailyGoalsSettings } from '@/hooks/use-daily-goals-settings';

interface DailyChecklist {
  tactics: boolean;
  study: boolean;
  game: boolean;
  date: string;
}

interface UseDailyGoalsOptions {
  autoCompleteFromSessions?: boolean;
  onGoalComplete?: (goalType: keyof Omit<DailyChecklist, 'date'>) => void;
}

const STORAGE_KEY = 'dailyChecklist';

export function useDailyGoals(options: UseDailyGoalsOptions = {}) {
  const { autoCompleteFromSessions = false, onGoalComplete } = options;

  // Get settings to determine auto-tracking mode
  const { settings } = useDailyGoalsSettings();
  const isAutoTrackingEnabled = settings?.autoTracking || false;

  const [checklist, setChecklist] = useState<DailyChecklist>({
    tactics: false,
    study: false,
    game: false,
    date: new Date().toDateString(),
  });

  // Fetch all sessions for progress calculation
  const { data: allSessions = [] } = useQuery({
    queryKey: ['all-sessions'],
    queryFn: async () => {
      if (!autoCompleteFromSessions && !isAutoTrackingEnabled) return [];

      const { getAllSessions } = await import('@/lib/firebase');
      return await getAllSessions();
    },
    enabled: autoCompleteFromSessions || isAutoTrackingEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Calculate progress when auto-tracking is enabled
  const progress: DailyGoalProgress | null = useMemo(() => {
    if (!isAutoTrackingEnabled || !settings) return null;
    return SessionAnalyzer.calculateProgress(allSessions, settings);
  }, [isAutoTrackingEnabled, allSessions, settings]);

  // Get today's sessions for backward compatibility
  const todaySessions = useMemo(() => {
    if (!allSessions.length) return [];
    return SessionAnalyzer.getTodaysSessions(allSessions);
  }, [allSessions]);

  // Load from localStorage on mount
  useEffect(() => {
    const loadChecklist = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as DailyChecklist;
          const today = new Date().toDateString();

          // If it's a new day, reset the checklist
          if (parsed.date !== today) {
            const fresh: DailyChecklist = {
              tactics: false,
              study: false,
              game: false,
              date: today,
            };
            setChecklist(fresh);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
          } else {
            setChecklist(parsed);
          }
        }
      } catch (error) {
        console.warn('Failed to load daily checklist:', error);
        // Reset to default state on error
        const fresh: DailyChecklist = {
          tactics: false,
          study: false,
          game: false,
          date: new Date().toDateString(),
        };
        setChecklist(fresh);
      }
    };

    loadChecklist();
  }, []);

  // Auto-complete goals based on today's sessions or progress
  useEffect(() => {
    if (isAutoTrackingEnabled && progress) {
      // Use progress-based completion for auto-tracking mode
      setChecklist((prev) => {
        const updated = { ...prev };
        let changed = false;

        if (progress.tactics.isComplete && !prev.tactics) {
          updated.tactics = true;
          changed = true;
          onGoalComplete?.('tactics');
        }
        if (progress.study.isComplete && !prev.study) {
          updated.study = true;
          changed = true;
          onGoalComplete?.('study');
        }
        if (progress.game.isComplete && !prev.game) {
          updated.game = true;
          changed = true;
          onGoalComplete?.('game');
        }

        return changed ? updated : prev;
      });
    } else if (autoCompleteFromSessions && todaySessions.length > 0) {
      // Use basic session detection for manual mode
      const hasTactics = todaySessions.some((s) => s.type === 'tactics');
      const hasStudy = todaySessions.some((s) => s.type === 'study');
      const hasGame = todaySessions.some((s) => s.type === 'game');

      setChecklist((prev) => {
        const updated = { ...prev };
        let changed = false;

        if (hasTactics && !prev.tactics) {
          updated.tactics = true;
          changed = true;
        }
        if (hasStudy && !prev.study) {
          updated.study = true;
          changed = true;
        }
        if (hasGame && !prev.game) {
          updated.game = true;
          changed = true;
        }

        return changed ? updated : prev;
      });
    }
  }, [todaySessions, autoCompleteFromSessions, isAutoTrackingEnabled, progress, onGoalComplete]);

  // Save to localStorage when checklist changes
  useEffect(() => {
    const saveChecklist = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(checklist));
      } catch (error) {
        console.warn('Failed to save daily checklist:', error);
      }
    };

    saveChecklist();
  }, [checklist]);

  const toggleItem = useCallback(
    (item: keyof Omit<DailyChecklist, 'date'>) => {
      setChecklist((prev) => {
        const newValue = !prev[item];
        const updated = {
          ...prev,
          [item]: newValue,
        };

        // Call callback if provided
        if (newValue && onGoalComplete) {
          onGoalComplete(item);
        }

        return updated;
      });
    },
    [onGoalComplete],
  );

  const completedCount = [checklist.tactics, checklist.study, checklist.game].filter(
    Boolean,
  ).length;
  const allComplete = completedCount === 3;

  return {
    checklist,
    toggleItem,
    completedCount,
    allComplete,
    todaySessions,
    // New progress data for auto-tracking
    progress,
    isAutoTrackingEnabled,
    // Utility functions for components
    formatters: {
      formatProgress: ProgressFormatter.formatProgress,
      getCompletionPercentage: ProgressFormatter.getCompletionPercentage,
      getGoalLabel: ProgressFormatter.getGoalLabel,
    },
  };
}
