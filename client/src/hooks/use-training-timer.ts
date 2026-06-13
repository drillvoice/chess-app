import { useCallback, useEffect, useRef } from 'react';
import { createSession, getSessionsByDateRange, updateSession } from '@/lib/firebase/firestore';
import { addCustomStudyTag } from '@/lib/firebase/settings';
import { parseStudyTags } from '@/lib/storage/study-tags';
import type { InsertTrainingSession, StudySession } from '@shared/schema';

// Stop counting after this long with no interaction, so a forgotten screen
// doesn't inflate practice time. 2.5 min tolerates thinking about a move.
const IDLE_TIMEOUT_MS = 150_000;
// Ignore sub-minute accruals so a quick glance doesn't create noise.
const MIN_FLUSH_MINUTES = 1;
const STUDY_TAG = 'openings';
// Sentinel that marks the session as one *we* created, so the same-day merge
// only ever grows our auto-log and never touches a manually entered session.
const AUTO_LOG_NOTE = 'Auto-logged from opening trainer';

interface UseTrainingTimerOptions {
  /** True while a drill is in progress (gates accrual). */
  enabled: boolean;
  /** Injectable for tests; defaults to the same-day merge writer below. */
  flushSession?: (minutes: number) => Promise<void>;
}

interface UseTrainingTimerResult {
  /** Call on every user interaction to keep the timer counting. */
  markActive: () => void;
}

/**
 * Writes (or grows) a single same-day "openings" study session. Best-effort:
 * the openings tag registration is non-fatal, but a failed session write is
 * logged with context (per CLAUDE.md "fail loud, log with context").
 */
async function defaultFlushSession(minutes: number): Promise<void> {
  try {
    // Register the tag so it appears in the tag UI/filters. The session write
    // itself doesn't require it, so failure here is non-fatal.
    await addCustomStudyTag(STUDY_TAG);
  } catch (err) {
    console.warn('[training-timer] could not register openings tag', err);
  }

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const sessions = await getSessionsByDateRange(start, end);
  const existing = sessions.find(
    (s) =>
      s.type === 'study' &&
      s.studyNotes === AUTO_LOG_NOTE &&
      (parseStudyTags(s.studyTags) ?? []).includes(STUDY_TAG),
  );

  if (existing) {
    // Persisted numbers are untrusted input — guard before arithmetic.
    const prev =
      typeof existing.duration === 'number' && Number.isFinite(existing.duration)
        ? existing.duration
        : 0;
    await updateSession(existing.id, { duration: prev + minutes });
  } else {
    // studyTags is serialized to a JSON string inside createSession; the typed
    // study schema carries it as an array, so build that shape and pass it on.
    const session: StudySession = {
      type: 'study',
      date: now,
      duration: minutes,
      studyTags: [STUDY_TAG],
      studyNotes: AUTO_LOG_NOTE,
    };
    await createSession(session as unknown as InsertTrainingSession);
  }
}

/**
 * Invisible, UI-agnostic timer that accumulates active practice time and writes
 * it out as an "openings" study session. Counting is gated by an idle deadline
 * and by Page Visibility, so brief pauses still count, idle screens don't, and
 * backgrounding the tab pauses the clock.
 */
export function useTrainingTimer({
  enabled,
  flushSession = defaultFlushSession,
}: UseTrainingTimerOptions): UseTrainingTimerResult {
  // All timing lives in refs: no re-renders, and the unmount/visibility
  // handlers always read the latest values rather than a stale closure.
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const closeSegment = useCallback(() => {
    if (segmentStartRef.current !== null) {
      const delta = Date.now() - segmentStartRef.current;
      if (Number.isFinite(delta) && delta > 0) {
        accumulatedMsRef.current += delta;
      }
      segmentStartRef.current = null;
    }
    clearIdleTimer();
  }, [clearIdleTimer]);

  const flush = useCallback(async () => {
    closeSegment();
    const minutes = accumulatedMsRef.current / 60_000;
    if (!Number.isFinite(minutes) || minutes < MIN_FLUSH_MINUTES) return;
    const rounded = Math.round(minutes);
    // Reset synchronously before awaiting so an overlapping flush (e.g. hidden
    // immediately followed by unmount) can't write the same time twice.
    accumulatedMsRef.current = 0;
    try {
      await flushSession(rounded);
    } catch (err) {
      console.error('[training-timer] failed to log study session', err);
    }
  }, [closeSegment, flushSession]);

  // Mount-once effects read flush via a ref so they never re-subscribe.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const markActive = useCallback(() => {
    if (!enabledRef.current || document.visibilityState !== 'visible') return;
    if (segmentStartRef.current === null) {
      segmentStartRef.current = Date.now();
    }
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      // No interaction for the timeout window — stop counting (but keep the
      // accumulated time buffered; it flushes on leave/hide/disable).
      closeSegment();
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimer, closeSegment]);

  const markActiveRef = useRef(markActive);
  markActiveRef.current = markActive;

  // Page Visibility: pause + flush when backgrounded, resume when foregrounded.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void flushRef.current();
      } else if (enabledRef.current) {
        markActiveRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Flush when a drill ends (enabled flips false). Don't auto-start when it
  // flips true — wait for the first markActive() so merely opening the page
  // doesn't start the clock.
  useEffect(() => {
    if (!enabled) {
      void flushRef.current();
    }
  }, [enabled]);

  // Flush on unmount (leaving the openings page). Best-effort: the
  // IndexedDB-first write typically completes even as React tears down.
  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, []);

  return { markActive };
}
