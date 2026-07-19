import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  SessionAnalyzer,
  ProgressFormatter,
  type GoalProgress,
  type GoalProgressMap,
} from '@/lib/daily-goals-progress';
import { resolveGoals, type ResolvedGoal } from '@/lib/daily-goals-model';
import { useDailyGoalsSettings } from '@/hooks/use-daily-goals-settings';
import { useStudyPreferences } from '@/hooks/use-study-preferences';

interface DailyChecklist {
  date: string;
  items: Record<string, boolean>;
}

interface UseDailyGoalsOptions {
  autoCompleteFromSessions?: boolean;
  onGoalComplete?: (goalId: string) => void;
}

const STORAGE_KEY = 'dailyChecklist';

const freshChecklist = (): DailyChecklist => ({
  date: new Date().toDateString(),
  items: {},
});

// The checklist used to be a flat `{ tactics, study, game, date }` record.
// Built-in goal ids are unchanged, so the old booleans lift directly into the
// new `items` map.
function parseStoredChecklist(saved: string): DailyChecklist {
  const parsed = JSON.parse(saved) as Record<string, unknown>;
  if (parsed && typeof parsed === 'object' && typeof parsed.date === 'string') {
    if (parsed.items && typeof parsed.items === 'object') {
      const items: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parsed.items as Record<string, unknown>)) {
        if (typeof value === 'boolean') items[key] = value;
      }
      return { date: parsed.date, items };
    }
    return {
      date: parsed.date,
      items: {
        tactics: Boolean(parsed.tactics),
        study: Boolean(parsed.study),
        game: Boolean(parsed.game),
      },
    };
  }
  return freshChecklist();
}

export function useDailyGoals(options: UseDailyGoalsOptions = {}) {
  const { autoCompleteFromSessions = false, onGoalComplete } = options;

  // Get settings to determine goals and auto-tracking mode
  const { settings } = useDailyGoalsSettings();
  const { preferences } = useStudyPreferences();
  const isAutoTrackingEnabled = settings?.autoTracking || false;

  const goals: ResolvedGoal[] = useMemo(
    () => resolveGoals(settings ?? null, preferences?.tagConfigs ?? {}),
    [settings, preferences],
  );

  const [checklist, setChecklist] = useState<DailyChecklist>(freshChecklist);

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
  const progress: GoalProgress[] | null = useMemo(() => {
    if (!isAutoTrackingEnabled || !settings) return null;
    return SessionAnalyzer.calculateProgress(allSessions, goals);
  }, [isAutoTrackingEnabled, allSessions, settings, goals]);

  const progressById: GoalProgressMap | null = useMemo(
    () => (progress ? SessionAnalyzer.toProgressMap(progress) : null),
    [progress],
  );

  // Get today's sessions for backward compatibility
  const todaySessions = useMemo(() => {
    if (!allSessions.length) return [];
    return SessionAnalyzer.getTodaysSessions(allSessions);
  }, [allSessions]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const parsed = parseStoredChecklist(saved);
      const today = new Date().toDateString();

      // If it's a new day, reset the checklist
      if (parsed.date !== today) {
        const fresh = freshChecklist();
        setChecklist(fresh);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      } else {
        setChecklist(parsed);
      }
    } catch (error) {
      console.warn('Failed to load daily checklist:', error);
      // Reset to default state on error
      setChecklist(freshChecklist());
    }
  }, []);

  // Auto-complete goals based on progress or today's sessions
  useEffect(() => {
    const completeItems = (isComplete: (goal: ResolvedGoal) => boolean) => {
      setChecklist((prev) => {
        const updated = { ...prev, items: { ...prev.items } };
        let changed = false;

        for (const goal of goals) {
          if (isComplete(goal) && !prev.items[goal.id]) {
            updated.items[goal.id] = true;
            changed = true;
            onGoalComplete?.(goal.id);
          }
        }

        return changed ? updated : prev;
      });
    };

    if (isAutoTrackingEnabled && progressById) {
      // Use progress-based completion for auto-tracking mode
      completeItems((goal) => progressById.get(goal.id)?.isComplete ?? false);
    } else if (autoCompleteFromSessions && todaySessions.length > 0) {
      // Use basic session detection for manual mode (built-in goals only)
      completeItems(
        (goal) => goal.kind !== 'tag' && todaySessions.some((s) => s.type === goal.kind),
      );
    }
  }, [
    todaySessions,
    autoCompleteFromSessions,
    isAutoTrackingEnabled,
    progressById,
    goals,
    onGoalComplete,
  ]);

  // Save to localStorage when checklist changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checklist));
    } catch (error) {
      console.warn('Failed to save daily checklist:', error);
    }
  }, [checklist]);

  const toggleItem = useCallback(
    (goalId: string) => {
      setChecklist((prev) => {
        const newValue = !prev.items[goalId];

        // Call callback if provided
        if (newValue && onGoalComplete) {
          onGoalComplete(goalId);
        }

        return { ...prev, items: { ...prev.items, [goalId]: newValue } };
      });
    },
    [onGoalComplete],
  );

  const completedCount = goals.filter((goal) => checklist.items[goal.id]).length;
  const allComplete = goals.length > 0 && completedCount === goals.length;

  return {
    goals,
    checklist,
    toggleItem,
    completedCount,
    allComplete,
    todaySessions,
    // Progress data for auto-tracking
    progress,
    progressById,
    isAutoTrackingEnabled,
    // Utility functions for components
    formatters: {
      formatProgress: ProgressFormatter.formatProgress,
      getCompletionPercentage: ProgressFormatter.getCompletionPercentage,
    },
  };
}
