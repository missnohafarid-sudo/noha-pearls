import { describe, expect, it } from 'vitest';
import { live, roster } from '../domain/visibility.fixtures';
import type { Session } from '../domain/models';
import { SqlDocumentStore } from '../infrastructure/SqlDocumentStore';
import { CountingSql } from '../infrastructure/testKit/CountingSql';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { INDEXED_FIELDS } from '../ports/storageLayout';
import { createDataServices } from './createDataServices';

const admin = { isAdmin: () => true, deviceId: () => 'laptop' };
const visitor = { isAdmin: () => false, deviceId: () => 'phone' };

async function school(endedClasses: number) {
  const sql = new CountingSql(new NodeSqlDatabase());
  const store = new SqlDocumentStore(sql);
  for (let n = 0; n < endedClasses; n += 1) await store.put('sessions', { ...live, id: `ended${n}`, code: `E${n}`, status: 'ended' });
  await store.put('sessions', { ...live, id: 'running', code: 'RUN234' });
  await store.put('rosters', { ...roster, id: 'running' });
  sql.reset();
  return { sql, store };
}

describe('asking which classes are running', () => {
  it('indexes the status of a class', () => {
    expect(INDEXED_FIELDS.sessions).toContain('status');
  });

  it('reads only the running classes, however many ended ones are stored', async () => {
    const { sql, store } = await school(120);
    const seen: Session[][] = [];
    createDataServices(store, admin).sessions.watchLive((sessions) => seen.push(sessions));
    expect(seen[0].map((session) => session.id)).toEqual(['running']);
    expect(sql.rowsRead).toBeLessThanOrEqual(3);
    sql.reset();
    const anyLive: boolean[] = [];
    createDataServices(store, visitor).classLookup.watchAnyLive((live) => anyLive.push(live));
    expect(anyLive).toEqual([true]);
    expect(sql.rowsRead).toBeLessThanOrEqual(3);
  });

  it('keeps the ended classes listable for the teacher, and the running list for the teacher only', async () => {
    const { store } = await school(5);
    const all: Session[][] = [];
    createDataServices(store, admin).sessions.watchAll((sessions) => all.push(sessions));
    expect(all[0]).toHaveLength(6);
    expect(() => createDataServices(store, visitor).sessions.watchLive(() => undefined)).toThrow();
  });

  it('follows a class as it ends', async () => {
    const { store } = await school(1);
    const seen: number[] = [];
    createDataServices(store, admin).sessions.watchLive((sessions) => seen.push(sessions.length));
    await createDataServices(store, admin).sessions.end('running');
    expect(seen).toEqual([1, 0]);
  });
});

describe('hearts', () => {
  it('start with the class’s id, so the packed store never scans for them', async () => {
    const { sql, store } = await school(0);
    for (let n = 0; n < 20; n += 1) {
      await store.put('sessions', { ...live, id: `other${n}`, code: `O${n}` });
      await store.put('rewards', { id: `other${n}:h`, sessionId: `other${n}`, target: { kind: 'student', id: 's1' }, source: 'teacher', at: 0 });
    }
    sql.reset();
    expect(await createDataServices(store, admin).rewards.giveAsTeacher('running', { kind: 'student', id: 's1' })).toBe(true);
    const [heart] = await store.list('rewards', { sessionId: 'running' });
    expect(heart.id.startsWith('running:')).toBe(true);
    expect(heart.id.length).toBeGreaterThan('running:'.length);
    expect(sql.rowsRead).toBeLessThanOrEqual(10);
  });
});
