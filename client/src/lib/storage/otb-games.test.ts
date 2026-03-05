import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { offlineStorage } from '../offline-storage';
import { getDB } from './db';

beforeEach(async () => {
  await offlineStorage.clearAll();
});

describe('otb games storage', () => {
  it('creates, lists, saves and deletes games', async () => {
    const created = await offlineStorage.createOtbGame({ whiteName: 'Alice', blackName: 'Bob' });
    expect(created.id).toBeTruthy();

    const listAfterCreate = await offlineStorage.getOtbGames();
    expect(listAfterCreate).toHaveLength(1);
    expect(listAfterCreate[0].whiteName).toBe('Alice');

    const saved = await offlineStorage.saveOtbGame({ ...created, whiteName: 'Alice Updated' });
    expect(saved.whiteName).toBe('Alice Updated');

    const fetched = await offlineStorage.getOtbGame(created.id);
    expect(fetched?.whiteName).toBe('Alice Updated');

    await offlineStorage.deleteOtbGame(created.id);
    const listAfterDelete = await offlineStorage.getOtbGames();
    expect(listAfterDelete).toHaveLength(0);
  });

  it('sorts games by updatedAt descending', async () => {
    const older = await offlineStorage.createOtbGame({ whiteName: 'Older' });
    const newer = await offlineStorage.createOtbGame({ whiteName: 'Newer' });
    await offlineStorage.saveOtbGame({ ...older, whiteName: 'Older updated' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await offlineStorage.saveOtbGame({ ...newer, whiteName: 'Newer updated' });

    const listed = await offlineStorage.getOtbGames();
    expect(listed[0].id).toBe(newer.id);
    expect(listed[1].id).toBe(older.id);
  });

  it('normalizes malformed records safely', async () => {
    const db = await getDB();
    await db.put('otb_games', {
      id: 'broken-record',
      createdAt: 'not-a-date',
      updatedAt: 'not-a-date',
      playedAt: 'not-a-date',
      whiteName: null,
      blackName: null,
      playerColor: 'purple',
      result: '*',
      moves: 'invalid',
      currentFen: null,
      status: 'invalid',
      linkedSessionId: null,
    } as any);

    const listed = await offlineStorage.getOtbGames();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('broken-record');
    expect(Array.isArray(listed[0].moves)).toBe(true);
    expect(listed[0].status).toBe('active');
  });
});
