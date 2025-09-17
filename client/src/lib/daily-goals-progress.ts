import type { TrainingSession, DailyGoalSettings } from '@shared/schema';

/**
 * Progress tracking data model for daily goals
 */
export interface DailyGoalProgress {
  tactics: {
    completed: number;
    target: number;
    unit: 'minutes';
    isComplete: boolean;
  };
  study: {
    completed: number;
    target: number;
    unit: 'minutes';
    isComplete: boolean;
  };
  game: {
    completed: number;
    target: number;
    unit: 'count';
    isComplete: boolean;
  };
}

/**
 * Extended progress with metadata
 */
export interface DailyGoalProgressData {
  progress: DailyGoalProgress;
  date: string;
  lastUpdated: Date;
  autoTracking: boolean;
}

/**
 * Session analysis utilities
 */
export class SessionAnalyzer {
  /**
   * Get today's sessions filtered by date
   */
  static getTodaysSessions(allSessions: TrainingSession[]): TrainingSession[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allSessions.filter((session) => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime();
    });
  }

  /**
   * Aggregate daily training session metrics in a single pass
   */
  static summarizeSessions(
    todaysSessions: TrainingSession[],
  ): { tacticsMinutes: number; studyMinutes: number; gamesCount: number } {
    return todaysSessions.reduce(
      (totals, session) => {
        switch (session.type) {
          case 'tactics':
            totals.tacticsMinutes += session.duration || 0;
            break;
          case 'study':
            totals.studyMinutes += session.duration || 0;
            break;
          case 'game':
            totals.gamesCount += 1;
            break;
          default:
            break;
        }

        return totals;
      },
      { tacticsMinutes: 0, studyMinutes: 0, gamesCount: 0 },
    );
  }

  /**
   * Calculate complete progress from sessions and settings
   */
  static calculateProgress(
    allSessions: TrainingSession[],
    settings: DailyGoalSettings | null,
  ): DailyGoalProgress {
    const todaysSessions = this.getTodaysSessions(allSessions);

    const { tacticsMinutes, studyMinutes, gamesCount } = this.summarizeSessions(
      todaysSessions,
    );

    // Default targets if no settings
    const tacticsTarget = settings?.tacticsMinutes || 0;
    const studyTarget = settings?.studyMinutes || 0;
    const gamesTarget = settings?.gamesCount || 0;

    return {
      tactics: {
        completed: tacticsMinutes,
        target: tacticsTarget,
        unit: 'minutes',
        isComplete: tacticsTarget > 0 && tacticsMinutes >= tacticsTarget,
      },
      study: {
        completed: studyMinutes,
        target: studyTarget,
        unit: 'minutes',
        isComplete: studyTarget > 0 && studyMinutes >= studyTarget,
      },
      game: {
        completed: gamesCount,
        target: gamesTarget,
        unit: 'count',
        isComplete: gamesTarget > 0 && gamesCount >= gamesTarget,
      },
    };
  }
}

/**
 * Progress formatting utilities
 */
export class ProgressFormatter {
  /**
   * Format progress for display (e.g., "15/30 minutes", "2/3 games")
   */
  static formatProgress(progress: DailyGoalProgress[keyof DailyGoalProgress]): string {
    if (progress.target === 0) return 'No goal set';

    const unit = progress.unit === 'minutes' ? 'min' : progress.unit === 'count' ? 'games' : '';
    return `${progress.completed}/${progress.target} ${unit}`;
  }

  /**
   * Calculate completion percentage (0-100)
   */
  static getCompletionPercentage(progress: DailyGoalProgress[keyof DailyGoalProgress]): number {
    if (progress.target === 0) return 0;
    return Math.min(100, Math.round((progress.completed / progress.target) * 100));
  }

  /**
   * Generate user-friendly goal label
   */
  static getGoalLabel(
    goalType: keyof DailyGoalProgress,
    progress: DailyGoalProgress[keyof DailyGoalProgress],
    showProgress: boolean = true,
  ): string {
    if (progress.target === 0) return '';

    const baseLabels = {
      tactics: `Practice tactics for ${progress.target} minutes`,
      study: `Study for ${progress.target} minutes`,
      game: `Play ${progress.target} game${progress.target !== 1 ? 's' : ''}`,
    };

    if (!showProgress) return baseLabels[goalType];

    const progressText = this.formatProgress(progress);
    return `${baseLabels[goalType]} (${progressText})`;
  }
}
