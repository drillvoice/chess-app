import type { TrainingSession } from '@shared/schema';
import { normalizeStudyTagKey } from '@shared/schema';
import { parseStudyTags } from './storage/study-tags';
import type { ResolvedGoal } from './daily-goals-model';

/**
 * Progress for a single resolved daily goal.
 */
export interface GoalProgress {
  goalId: string;
  completed: number;
  target: number;
  unitLabel: string;
  isComplete: boolean;
}

export type GoalProgressMap = Map<string, GoalProgress>;

function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sessionHasTag(session: TrainingSession, tagKey: string): boolean {
  const tags = parseStudyTags(session.studyTags, session.id);
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => typeof tag === 'string' && normalizeStudyTagKey(tag) === tagKey);
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
   * Measure today's progress toward a single goal.
   */
  static measureGoal(todaysSessions: TrainingSession[], goal: ResolvedGoal): number {
    switch (goal.kind) {
      case 'tactics':
      case 'study':
        return todaysSessions.reduce(
          (total, session) =>
            session.type === goal.kind ? total + finiteOrZero(session.duration) : total,
          0,
        );
      case 'game':
        return todaysSessions.filter((session) => session.type === 'game').length;
      case 'tag': {
        const tagKey = normalizeStudyTagKey(goal.tag ?? '');
        const studySessions = todaysSessions.filter((session) => session.type === 'study');
        if (goal.useQuantity) {
          // The tag has a configured unit: sum the logged quantity of sessions
          // recorded against it (quantity always pairs with primaryStudyTag).
          return studySessions.reduce(
            (total, session) =>
              session.primaryStudyTag && normalizeStudyTagKey(session.primaryStudyTag) === tagKey
                ? total + finiteOrZero(session.quantity)
                : total,
            0,
          );
        }
        // No unit config: count sessions logged with the tag.
        return studySessions.filter((session) => sessionHasTag(session, tagKey)).length;
      }
    }
  }

  /**
   * Calculate progress for each resolved goal from all sessions.
   */
  static calculateProgress(allSessions: TrainingSession[], goals: ResolvedGoal[]): GoalProgress[] {
    const todaysSessions = this.getTodaysSessions(allSessions);

    return goals.map((goal) => {
      const completed = this.measureGoal(todaysSessions, goal);
      return {
        goalId: goal.id,
        completed,
        target: goal.target,
        unitLabel: goal.unitLabel,
        isComplete: goal.target > 0 && completed >= goal.target,
      };
    });
  }

  static toProgressMap(progress: GoalProgress[]): GoalProgressMap {
    return new Map(progress.map((entry) => [entry.goalId, entry]));
  }
}

/**
 * Progress formatting utilities
 */
export class ProgressFormatter {
  /**
   * Format progress for display (e.g., "15/30 min", "2/3 modules")
   */
  static formatProgress(progress: GoalProgress): string {
    if (progress.target === 0) return 'No goal set';
    return `${progress.completed}/${progress.target} ${progress.unitLabel}`;
  }

  /**
   * Calculate completion percentage (0-100)
   */
  static getCompletionPercentage(progress: GoalProgress): number {
    if (progress.target === 0) return 0;
    return Math.min(100, Math.round((progress.completed / progress.target) * 100));
  }
}
