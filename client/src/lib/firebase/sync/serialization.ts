import type { TrainingSession } from '@shared/schema';
import { Timestamp } from '../core';

interface TimestampLike {
  toDate: () => Date;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  );
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (isTimestampLike(value)) {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

export function omitUndefinedFields<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as T;
}

export function sessionRecency(
  session: Partial<TrainingSession> & { updatedAt?: unknown; date?: unknown },
): number {
  return (
    toDate(session.updatedAt)?.getTime() ??
    toDate(session.date)?.getTime() ??
    Number.NEGATIVE_INFINITY
  );
}

function normalizeSessionId(id: unknown): number | null {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return id;
  }
  if (typeof id === 'string' && id.trim().length > 0) {
    const parsed = Number(id);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeSessionForSync(session: TrainingSession): TrainingSession | null {
  const raw = session as Record<string, unknown>;
  const normalizedId = normalizeSessionId(raw.id);
  if (normalizedId == null) {
    return null;
  }
  const normalizedDate = toDate(raw.date);
  if (!normalizedDate) {
    return null;
  }

  return {
    ...session,
    id: normalizedId,
    date: normalizedDate,
    updatedAt: toDate(raw.updatedAt) ?? undefined,
    deletedAt: toDate(raw.deletedAt) ?? undefined,
    needsReview: Boolean(raw.needsReview),
  } as TrainingSession;
}

export function serializeSessionForCloud(session: TrainingSession) {
  const normalizedSession = normalizeSessionForSync(session);
  if (!normalizedSession) {
    const rawId = (session as Record<string, unknown>).id;
    throw new Error(`Session ${String(rawId)} is missing a valid id or date`);
  }

  const raw = normalizedSession as Record<string, unknown>;
  const deletedAt = toDate(raw.deletedAt);
  return omitUndefinedFields({
    ...normalizedSession,
    date: Timestamp.fromDate(normalizedSession.date),
    updatedAt: Timestamp.fromDate(toDate(raw.updatedAt) ?? new Date()),
    deletedAt: deletedAt ? Timestamp.fromDate(deletedAt) : null,
  });
}

export function deserializeSessionFromCloud(payload: Record<string, unknown>): TrainingSession {
  const rawId = payload.id;
  const parsedId = typeof rawId === 'number' ? rawId : Number(rawId);
  return {
    ...payload,
    id: parsedId,
    date: toDate(payload.date) ?? new Date(),
    updatedAt: toDate(payload.updatedAt) ?? undefined,
    deletedAt: toDate(payload.deletedAt) ?? undefined,
    needsReview: Boolean(payload.needsReview),
  } as unknown as TrainingSession;
}
