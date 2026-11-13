import { describe, expect, it } from 'vitest';
import type { Answer, Session, Student } from '../domain/models';
import type { CollectionName, DocumentStore } from '../ports/store';
import { LocalChangeBus, LocalDocumentStore } from './LocalDocumentStore';
import { SqlDocumentStore } from './SqlDocumentStore';
import { MemoryStorage } from './storage';
import { CountingSql } from './testKit/CountingSql';
import { NodeSqlDatabase } from './testKit/NodeSqlDatabase';

function setup() {
  const sql = new CountingSql(new NodeSqlDatabase());
  return { sql, store: new SqlDocumentStore(sql) };
}

const student = (id: string, groupId: string): Student => ({ id, name: id, cardNumber: 1, groupId });
const session = (id: string, status: Session['status'], code: string): Session => ({
  id, code, lessonId: 'l', classId: 'c', className: 'c', teacherId: 't', teacherName: 't', status, slideIndex: 0, reveals: {}, pacing: {}, message: null, startedAt: 0,
});
const answer = (sessionId: string, n: number, value: number): Answer => ({ id: `${sessionId}:q${n}:s1`, sessionId, slideId: `q${n}`, subject: { kind: 'student', id: 's1' }, value, source: 'device', at: n });

describe('the result cache of the SQL store', () => {
  it('answers a repeated question without reading rows, and reads again after a write that could change it', async () => {
    const { store, sql } = setup();
    for (let n = 0; n < 20; n += 1) await store.put('students', student(`s${n}`, 'g1'));
    await store.list('students', { groupId: 'g1' });
    sql.reset();
    expect(await store.list('students', { groupId: 'g1' })).toHaveLength(20);
    expect(await store.list('students', { groupId: 'g1' })).toHaveLength(20);
    expect(sql.rowsRead).toBe(0);
    await store.put('students', student('extra', 'g1'));
    sql.reset();
    expect(await store.list('students', { groupId: 'g1' })).toHaveLength(21);
    expect(sql.rowsRead).toBeGreaterThan(0);
  });

  it('keeps answers about other collections, and about other classes’ packed rows, when something else is written', async () => {
    const { store, sql } = setup();
    await store.put('teachers', { id: 't1', name: 'a', order: 1 });
    await store.put('answers', answer('class-a', 1, 1));
    await store.put('answers', answer('class-b', 1, 1));
    await store.list('teachers');
    await store.list('answers', { sessionId: 'class-a' });
    sql.reset();
    await store.put('students', student('s1', 'g1'));
    await store.put('answers', answer('class-b', 2, 2));
    sql.reset();
    await store.list('teachers');
    await store.list('answers', { sessionId: 'class-a' });
    expect(sql.rowsRead).toBe(0);
    await store.list('answers', { sessionId: 'class-b' });
    expect(sql.rowsRead).toBeGreaterThan(0);
  });

  it('does not let a reader change what the next reader gets', async () => {
    const { store } = setup();
    await store.put('students', student('s1', 'g1'));
    (await store.list('students', {})).pop();
    expect(await store.list('students', {})).toHaveLength(1);
  });

  it('gives the same results as a store without it under a random mix of writes and reads', async () => {
    const { store } = setup();
    const oracle: DocumentStore = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'oracle');
    let seed = 12345;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % limit;
    };
    const statuses: Session['status'][] = ['live', 'ended'];
    const queries: [CollectionName, object][] = [
      ['students', {}], ['students', { groupId: 'g1' }], ['students', { groupId: 'g2' }], ['sessions', { status: 'live' }], ['sessions', {}],
      ['sessions', { code: 'AAA' }], ['answers', { sessionId: 'x' }], ['answers', { sessionId: 'y' }], ['answers', {}],
    ];
    for (let step = 0; step < 400; step += 1) {
      const [kind, n, pick, value] = [random(6), random(8), random(2), random(3)];
      const both = async (write: (target: DocumentStore) => Promise<unknown>) => void (await write(store), await write(oracle));
      if (kind === 0) await both((s) => s.put('students', student(`s${n}`, n % 2 ? 'g1' : 'g2')));
      else if (kind === 1) await both((s) => s.put('sessions', session(`x${n}`, statuses[pick], n % 2 ? 'AAA' : 'BBB')));
      else if (kind === 2) await both((s) => s.put('answers', answer(n % 2 ? 'x' : 'y', n, value)));
      else if (kind === 3) await both((s) => (pick ? s.remove('students', `s${n}`) : s.remove('sessions', `x${n}`)));
      else if (kind === 4) await both((s) => s.remove('answers', `${n % 2 ? 'x' : 'y'}:q${n}:s1`));
      else await both((s) => s.update('sessions', `x${n}`, (current) => ({ ...current, status: 'ended' })));
      for (const [collection, where] of queries) {
        const ordered = async (target: DocumentStore) => JSON.stringify((await target.list(collection, where as never)).sort((a, b) => a.id.localeCompare(b.id)));
        expect(await ordered(store), `step ${step} ${collection} ${JSON.stringify(where)}`).toBe(await ordered(oracle));
      }
    }
  });
});
