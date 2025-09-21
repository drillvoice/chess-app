import type { TrainingSession } from '@shared/schema';
import { offlineStorage } from './offline-storage';
import { queryClient } from './queryClient';
import { sessionEvents } from './session-events';

const SESSION_QUERY_KEYS: readonly (readonly unknown[])[] = [
  ['all-sessions'],
  ['sessions'],
] as const;

function toTimestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function sortSessions(sessions: TrainingSession[]): TrainingSession[] {
  return sessions.sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
}

function invalidateDerivedQueries() {
  void queryClient.invalidateQueries({ queryKey: ['statistics'] });
  void queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
  void queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
}

type SessionsUpdater = (sessions: TrainingSession[]) => TrainingSession[];

function applySessionUpdate(updater: SessionsUpdater): void {
  const missingKeys: (readonly unknown[])[] = [];

  for (const key of SESSION_QUERY_KEYS) {
    const current = queryClient.getQueryData<TrainingSession[]>(key);
    if (current) {
      const updated = sortSessions(updater([...current]));
      queryClient.setQueryData<TrainingSession[]>(key, updated);
    } else {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    offlineStorage
      .getSessions()
      .then((sessions) => {
        const updated = sortSessions(updater([...sessions]));
        for (const key of missingKeys) {
          queryClient.setQueryData<TrainingSession[]>(key, [...updated]);
        }
      })
      .catch((error) => {
        console.warn('Failed to hydrate session cache from offline storage:', error);
      });
  }
}

function handleSessionAdded(session: TrainingSession): void {
  applySessionUpdate((sessions) => {
    const existingIndex = sessions.findIndex((item) => item.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }
    return sessions;
  });
  invalidateDerivedQueries();
}

function handleSessionUpdated(session: TrainingSession): void {
  applySessionUpdate((sessions) => {
    const existingIndex = sessions.findIndex((item) => item.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }
    return sessions;
  });
  invalidateDerivedQueries();
}

function handleSessionDeleted(payload: { id: number }): void {
  applySessionUpdate((sessions) => sessions.filter((item) => item.id !== payload.id));
  invalidateDerivedQueries();
}

function handleSessionsReplaced(sessions: TrainingSession[]): void {
  const sorted = sortSessions([...sessions]);
  for (const key of SESSION_QUERY_KEYS) {
    queryClient.setQueryData<TrainingSession[]>(key, [...sorted]);
  }
  invalidateDerivedQueries();
}

sessionEvents.on('sessionAdded', handleSessionAdded);
sessionEvents.on('sessionUpdated', handleSessionUpdated);
sessionEvents.on('sessionDeleted', handleSessionDeleted);
sessionEvents.on('sessionsReplaced', handleSessionsReplaced);
