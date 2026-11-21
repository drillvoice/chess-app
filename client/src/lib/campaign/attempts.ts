import { findNode } from './chapters';
import { isPlacementNodeId } from './placement';
import { TRIAL_MS, TRIAL_TARGET } from './trial-rules';

/**
 * One finished trial. Attempts are append-only (never edited or deleted), so
 * syncing across devices is a plain union by id. Stars are not stored: they are
 * derived from `clean` / `completedMs` so a rule change applies to history too.
 */
export interface CampaignAttempt {
  id: string;
  nodeId: string;
  /** ISO time the trial clock started. */
  startedAt: string;
  /** Active time the trial ran for. */
  durationMs: number;
  attempted: number;
  clean: number;
  completedMs: number | null;
}

const MAX_PUZZLES = 1000;

function finiteInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Validate an attempt read from IndexedDB or Firestore. Returns null (and the
 * caller drops it) for anything that can't be trusted: an unknown node, a bad
 * date, or non-finite numbers. Values are clamped to what a trial can produce.
 */
export function normalizeAttempt(raw: unknown): CampaignAttempt | null {
  const r = raw as Partial<Record<keyof CampaignAttempt, unknown>> | null;
  if (!r || typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.nodeId !== 'string') return null;
  if (!findNode(r.nodeId) && !isPlacementNodeId(r.nodeId)) return null;
  if (typeof r.startedAt !== 'string' || !Number.isFinite(Date.parse(r.startedAt))) return null;
  const durationMs = finiteInRange(r.durationMs, 0, TRIAL_MS * 2);
  const attempted = finiteInRange(r.attempted, 0, MAX_PUZZLES);
  const clean = finiteInRange(r.clean, 0, MAX_PUZZLES);
  if (durationMs === null || attempted === null || clean === null) return null;
  const completedMs =
    r.completedMs === null || r.completedMs === undefined
      ? null
      : finiteInRange(r.completedMs, 1, TRIAL_MS);
  return {
    id: r.id,
    nodeId: r.nodeId,
    startedAt: new Date(Date.parse(r.startedAt)).toISOString(),
    durationMs: Math.round(durationMs),
    attempted: Math.round(attempted),
    clean: Math.min(Math.round(clean), Math.round(attempted)),
    // A completion time only counts with the full target solved.
    completedMs: completedMs !== null && clean >= TRIAL_TARGET ? Math.round(completedMs) : null,
  };
}

/**
 * Compare local and cloud attempts. Because attempts are append-only, the only
 * work is copying across whatever one side is missing — including local
 * attempts whose first upload was skipped (e.g. saved before auth resolved).
 */
export function reconcileAttempts(
  local: CampaignAttempt[],
  remote: CampaignAttempt[],
): { missingLocally: CampaignAttempt[]; missingRemotely: CampaignAttempt[] } {
  const localIds = new Set(local.map((a) => a.id));
  const remoteIds = new Set(remote.map((a) => a.id));
  return {
    missingLocally: remote.filter((a) => !localIds.has(a.id)),
    missingRemotely: local.filter((a) => !remoteIds.has(a.id)),
  };
}
