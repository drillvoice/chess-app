import type { GameSession, TrainingSession } from '@shared/schema';

/** Optimistic session for an edit-in-place update of an existing game session. */
export function buildEditOptimisticSession(
  editingSession: TrainingSession,
  newSession: GameSession,
): TrainingSession {
  return {
    id: editingSession.id,
    type: 'game',
    date: newSession.date || editingSession.date,
    duration: editingSession.duration, // Preserve existing duration
    pointsGained: null,
    finalScore: null,
    puzzlesAttempted: null,
    puzzlesCorrect: null,
    tacticsNotes: null,
    gameResult: newSession.gameResult,
    gameType: null,
    gameComments: newSession.gameComments || null,
    playerColor: newSession.playerColor,
    platform: newSession.platform ?? editingSession.platform, // Preserve existing platform if not changed
    timeControl: newSession.timeControl ?? editingSession.timeControl, // Preserve existing timeControl if not changed
    opponentUsername: newSession.opponentUsername || editingSession.opponentUsername || null,
    openingName: editingSession.openingName ?? null,
    openingEco: editingSession.openingEco ?? null,
    studyType: null,
    studyTags: null,
    studyNotes: null,
    quantity: null,
    primaryStudyTag: null,
    goalTitle: null,
    goalDescription: null,
    goalWeekStart: null,
    needsReview: false,
  };
}

/** Optimistic session for a newly created game session (pending server confirmation). */
export function buildCreateOptimisticSession(
  newSession: GameSession,
  tempId: number,
): TrainingSession {
  return {
    id: tempId,
    type: 'game',
    date: newSession.date,
    duration: null,
    pointsGained: null,
    finalScore: null,
    puzzlesAttempted: null,
    puzzlesCorrect: null,
    tacticsNotes: null,
    gameResult: newSession.gameResult,
    gameType: null,
    gameComments: newSession.gameComments || null,
    playerColor: newSession.playerColor,
    platform: newSession.platform ?? null,
    timeControl: newSession.timeControl ?? null,
    opponentUsername: newSession.opponentUsername || null,
    openingName: null,
    openingEco: null,
    studyType: null,
    studyTags: null,
    studyNotes: null,
    quantity: null,
    primaryStudyTag: null,
    goalTitle: null,
    goalDescription: null,
    goalWeekStart: null,
    needsReview: false,
    // Add a flag to identify this as a pending session
    _pending: true,
  } as any;
}

/** Unique opponent names from OTB game sessions, sorted case-insensitively. */
export function extractOtbOpponentNames(sessions: TrainingSession[] | undefined): string[] {
  if (!sessions) return [];

  const names = sessions
    .filter(
      (session) =>
        session.type === 'game' && session.platform === 'otb' && session.opponentUsername,
    )
    .map((session) => session.opponentUsername as string);

  // Return unique names sorted alphabetically
  return Array.from(new Set(names)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Filter opponent names by a case-insensitive substring query; empty query yields no results. */
export function filterOpponentNames(names: string[], rawQuery: string): string[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return [];
  }

  return names.filter((name) => name.toLowerCase().includes(query));
}
