import { offlineStorage } from '../offline-storage';
import { getAllSessions, createSession } from './firestore';

export async function verifyDataPresence(): Promise<boolean> {
  try {
    const cached = await offlineStorage.getSessions();
    // Fetch fresh data via dynamic import so tests can mock the function.
    // Using a runtime import ensures the spy applied in tests intercepts the
    // call, avoiding unintended network/mock behavior.
    const { fetchSessionsFromFirebase } = await import('./firestore');
    await fetchSessionsFromFirebase();
    console.log('Migration verification: cached', cached?.length || 0, 'live read successful');
    return true;
  } catch (error) {
    console.error('Migration verification failed:', error);
    return false;
  }
}

export async function exportData(): Promise<string> {
  const sessions = await getAllSessions();
  return JSON.stringify(sessions, null, 2);
}

export async function importData(
  data: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ imported: number; skipped: number }> {
  const sessions: any[] = JSON.parse(data);
  const total = sessions.length;
  const errors: Array<{ id: number; error: unknown }> = [];

  const existingSessions = await offlineStorage.getSessions();
  const existingIds = new Set(existingSessions.map((s) => s.id));

  let imported = 0;
  let skipped = 0;
  let processed = 0;

  // Import each session, preserving IDs when provided
  for (const session of sessions) {
    const { id, date, createdAt: _createdAt, ...rest } = session as any;

    if (existingIds.has(id)) {
      skipped++;
      continue;
    }

    let normalizedDate: Date;
    if (typeof date === 'string' || typeof date === 'number') {
      normalizedDate = new Date(date);
    } else if (date && typeof date === 'object' && 'seconds' in date && 'nanoseconds' in date) {
      normalizedDate = new Date(date.seconds * 1000 + date.nanoseconds / 1e6);
    } else if (date instanceof Date) {
      normalizedDate = date;
    } else {
      normalizedDate = new Date();
    }

    // Skip sessions with invalid dates and record the error for reporting
    if (isNaN(normalizedDate.getTime())) {
      errors.push({ id, error: new Error('Invalid date') });
      continue;
    }

    try {
      await createSession({ ...rest, date: normalizedDate }, id);
      imported++;
      processed++;
      existingIds.add(id);
      onProgress?.(processed, total);
    } catch (error) {
      errors.push({ id, error });
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors.map((e) => e.error),
      `Failed to import ${errors.length} sessions`,
    );
  }

  return { imported, skipped };
}

