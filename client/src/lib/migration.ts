import type { TrainingSession } from '@shared/schema';

/**
 * Migration utility for study sessions
 * Converts legacy studyType to new studyTags format
 */

// Map of old studyType values to new tag names
const STUDY_TYPE_TO_TAG_MAP: Record<string, string> = {
  video: 'videos',
  book: 'reading',
  analysis: 'analysis',
  chessable: 'chessable',
  coaching: 'coaching',
  'online-course': 'online-course',
};

/**
 * Migrate a single study session from legacy studyType to new studyTags format
 */
export function migrateStudySession(session: TrainingSession): TrainingSession {
  // Only migrate study sessions that have studyType but no studyTags
  if (session.type !== 'study' || !session.studyType || session.studyTags) {
    return session;
  }

  const legacyTag = STUDY_TYPE_TO_TAG_MAP[session.studyType];
  if (!legacyTag) {
    // Unknown studyType, keep as is
    return session;
  }

  // Convert to new format
  return {
    ...session,
    studyTags: JSON.stringify([legacyTag]),
    // Keep studyType for backward compatibility
  };
}

/**
 * Migrate all study sessions in a list
 */
export function migrateStudySessions(sessions: TrainingSession[]): TrainingSession[] {
  return sessions.map(migrateStudySession);
}

/**
 * Check if a session needs migration
 */
export function needsMigration(session: TrainingSession): boolean {
  return session.type === 'study' && !!session.studyType && !session.studyTags;
}

/**
 * Get migration statistics for a list of sessions
 */
export function getMigrationStats(sessions: TrainingSession[]) {
  const studySessions = sessions.filter((s) => s.type === 'study');
  const needsMigrationCount = studySessions.filter(needsMigration).length;
  const alreadyMigratedCount = studySessions.filter((s) => s.studyTags).length;
  const noStudyTypeCount = studySessions.filter((s) => !s.studyType && !s.studyTags).length;

  return {
    totalStudySessions: studySessions.length,
    needsMigration: needsMigrationCount,
    alreadyMigrated: alreadyMigratedCount,
    noStudyType: noStudyTypeCount,
    migrationNeeded: needsMigrationCount > 0,
  };
}

/**
 * Validate that migration was successful
 */
export function validateMigration(sessions: TrainingSession[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const session of sessions) {
    if (session.type === 'study') {
      // Check for invalid studyTags JSON
      if (session.studyTags) {
        try {
          const tags = JSON.parse(session.studyTags);
          if (!Array.isArray(tags)) {
            errors.push(`Session ${session.id}: studyTags is not an array`);
          }
        } catch (e) {
          errors.push(`Session ${session.id}: Invalid studyTags JSON`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
