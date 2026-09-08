import { withStores } from './transaction';
import type { DailyGoalSettings, TrainingSession } from '@shared/schema';
import type { OpeningRepertoire } from '../opening-trainer/types';

const SNAPSHOTS = 'account_snapshots';

export interface AccountSnapshotPayload {
  sessions: TrainingSession[];
  settings: any;
  dailyGoals: DailyGoalSettings | null;
  /** Opening repertoires are cleared on an account switch, so keep a copy. */
  openingRepertoires?: OpeningRepertoire[];
}

export interface AccountSnapshotRecord {
  id: string;
  uid: string;
  createdAt: string;
  payload: {
    sessions: Array<TrainingSession & { date: string; updatedAt?: string; deletedAt?: string }>;
    settings: any;
    dailyGoals: (DailyGoalSettings & { id: 'current'; lastModified?: string }) | null;
    openingRepertoires: OpeningRepertoire[];
  };
}

export async function createAccountSnapshot(
  uid: string,
  payload: AccountSnapshotPayload,
): Promise<string> {
  const id = `snapshot:${uid}:${Date.now()}`;
  const sessions = payload.sessions.map((session) => {
    const sessionAny = session as any;
    return {
      ...sessionAny,
      date: session.date.toISOString(),
      updatedAt:
        sessionAny.updatedAt instanceof Date
          ? sessionAny.updatedAt.toISOString()
          : sessionAny.updatedAt,
      deletedAt:
        sessionAny.deletedAt instanceof Date
          ? sessionAny.deletedAt.toISOString()
          : sessionAny.deletedAt,
    };
  });
  const dailyGoals = payload.dailyGoals
    ? {
        id: 'current' as const,
        ...payload.dailyGoals,
        lastModified:
          payload.dailyGoals.lastModified instanceof Date
            ? payload.dailyGoals.lastModified.toISOString()
            : payload.dailyGoals.lastModified,
      }
    : null;

  await withStores([SNAPSHOTS] as const, 'readwrite', async ({ account_snapshots }) => {
    await account_snapshots.put({
      id,
      uid,
      createdAt: new Date().toISOString(),
      payload: {
        sessions,
        settings: payload.settings ?? null,
        dailyGoals,
        openingRepertoires: payload.openingRepertoires ?? [],
      },
    });
  });

  return id;
}

export async function listAccountSnapshots(uid?: string): Promise<AccountSnapshotRecord[]> {
  return withStores([SNAPSHOTS] as const, 'readonly', async ({ account_snapshots }) => {
    const all = await account_snapshots.getAll();
    const filtered = uid ? all.filter((snapshot) => snapshot.uid === uid) : all;
    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ) as AccountSnapshotRecord[];
  });
}
