import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

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
  
  const [checklist, setChecklist] = useState<DailyChecklist>({
    tactics: false,
    study: false,
    game: false,
    date: new Date().toDateString(),
  });

  // Fetch today's sessions for auto-completion
  const { data: todaySessions } = useQuery({
    queryKey: ['today-sessions'],
    queryFn: async () => {
      if (!autoCompleteFromSessions) return [];
      
      const { getAllSessions } = await import('@/lib/firebase');
      const allSessions = await getAllSessions();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      return allSessions.filter(session => {
        const sessionDate = new Date(session.date);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate.getTime() === today.getTime();
      });
    },
    enabled: autoCompleteFromSessions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

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

  // Auto-complete goals based on today's sessions
  useEffect(() => {
    if (!autoCompleteFromSessions || !todaySessions) return;

    const hasTactics = todaySessions.some(s => s.type === 'tactics');
    const hasStudy = todaySessions.some(s => s.type === 'study');
    const hasGame = todaySessions.some(s => s.type === 'game');

    setChecklist(prev => {
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
  }, [todaySessions, autoCompleteFromSessions]);

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

  const toggleItem = useCallback((item: keyof Omit<DailyChecklist, 'date'>) => {
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
  }, [onGoalComplete]);

  const completedCount = [checklist.tactics, checklist.study, checklist.game].filter(Boolean).length;
  const allComplete = completedCount === 3;

  return {
    checklist,
    toggleItem,
    completedCount,
    allComplete,
    todaySessions,
  };
}
