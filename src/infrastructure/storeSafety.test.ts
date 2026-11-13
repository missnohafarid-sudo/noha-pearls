import { describe, expect, it } from 'vitest';
import type { Answer, Student, Teacher } from '../domain/models';
import { MAX_CACHE_KEY_LENGTH } from '../ports/limits';
import { SqlDocumentStore } from './SqlDocumentStore';
import { CountingSql } from './testKit/CountingSql';
import { NodeSqlDatabase } from './testKit/NodeSqlDatabase';

/**
 * Rows are counted as the SQL wrapper sees them returned. `node:sqlite` reports no count of rows scanned per statement, so
 * for a read that scans, the rows it returns are the count; every read here is a plain `SELECT` that returns what it scans.
 */
function setup() {
  const sql = new CountingSql(new NodeSqlDatabase());
  const reported: unknown[] = [];
  return { sql, reported, store: new SqlDocumentStore(sql, (error) => reported.push(error)) };
}

const teacher = (n: number): Teacher => ({ id: `t${n}`, name: `T${n}`, order: n });
const student = (id: string): Student => ({ id, name: id, cardNumber: 1, groupId: 'g1' });
const answer = (sessionId: string, n: number): Answer => ({ id: `${sessionId}:q${n}:s1`, sessionId, slideId: `q${n}`, subject: { kind: 'student', id: 's1' }, value: 1, source: 'device', at: n });

describe('a watcher that fails', () => {
  it('is not left registered when the first value cannot be worked out', async () => {
    const { store } = setup();
    let calls = 0;
    expect(() => store.watch('teachers', {}, () => { calls += 1; throw new Error('first value'); })).toThrow('first value');
    await store.put('teachers', teacher(1));
    expect(calls).toBe(1);
  });

  it('is dropped and reported, while the others still hear of the change and the writer is not told', async () => {
    const { store, reported } = setup();
    const heard = { before: 0, after: 0 };
    let droppedFor: unknown = null;
    let failing = 0;
    store.watch('teachers', {}, () => { heard.before += 1; });
    store.watch('teachers', {}, () => { failing += 1; if (failing > 1) throw new Error('later value'); }, (error) => { droppedFor = error; });
    store.watch('teachers', {}, () => { heard.after += 1; });
    await store.put('teachers', teacher(1));
    expect(heard).toEqual({ before: 2, after: 2 });
    expect(droppedFor).toEqual(new Error('later value'));
    expect(reported).toEqual([new Error('later value')]);
    await store.put('teachers', teacher(2));
    expect(failing).toBe(2);
    expect(heard).toEqual({ before: 3, after: 3 });
  });
});

describe('a filter that cannot match', () => {
  const wrong: [string, unknown][] = [
    ['a number for an id', 0],
    ['an object', { $gt: '' }],
    ['an array', ['s1']],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['a very deep array', JSON.parse(`${'['.repeat(20_000)}${']'.repeat(20_000)}`)],
  ];

  it('matches nothing and reads no row, whatever the field and the collection', async () => {
    const { store, sql } = setup();
    for (let n = 0; n < 5; n += 1) {
      await store.put('students', student(`s${n}`));
      await store.put('answers', answer(`class-${n}`, 1));
      await store.put('teachers', teacher(n));
    }
    for (const [label, value] of wrong) {
      const fields = [['answers', 'sessionId'], ['answers', 'id'], ['students', 'groupId'], ['students', 'id'], ['teachers', 'name'], ['teachers', 'id']] as const;
      for (const [collection, field] of fields.filter(([, name]) => typeof value !== 'number' || !Number.isFinite(value) || name === 'id' || name === 'sessionId')) {
        sql.reset();
        expect(await store.list(collection, { [field]: value } as never), `${label} for ${collection}.${field}`).toEqual([]);
        expect(sql.rowsRead, `${label} for ${collection}.${field}`).toBe(0);
        const seen: unknown[] = [];
        const stop = store.watch(collection, { [field]: value } as never, (docs) => seen.push(docs));
        stop();
        expect(seen).toEqual([[]]);
        expect(sql.rowsRead).toBe(0);
      }
      sql.reset();
      expect(await store.get('answers', value as string)).toBeNull();
      expect(sql.rowsRead, label).toBe(0);
    }
  });

  it('still reads one class or one document for the right kind of value', async () => {
    const { store, sql } = setup();
    for (let n = 0; n < 5; n += 1) await store.put('answers', answer(`class-${n}`, 1));
    sql.reset();
    expect(await store.list('answers', { sessionId: 'class-2' })).toHaveLength(1);
    expect(sql.rowsRead).toBe(1);
  });
});

describe('the remembered answers', () => {
  it('are kept for a short question and not for one longer than the limit, which is worked out afresh each time', async () => {
    const { store, sql } = setup();
    for (let n = 0; n < 3; n += 1) await store.put('students', student(`s${n}`));
    const short = { groupId: 'g1' };
    await store.list('students', short);
    sql.reset();
    await store.list('students', short);
    expect(sql.rowsRead).toBe(0);
    const long = { groupId: 'g'.repeat(MAX_CACHE_KEY_LENGTH + 1) };
    sql.reset();
    await store.list('students', long);
    await store.list('students', long);
    expect(sql.statements).toBe(2);
    await store.put('students', student('s9'));
    expect(await store.list('students', short)).toHaveLength(4);
  });

  it('cannot be changed in place by a reader, so the next reader is shown the stored document', async () => {
    const { store } = setup();
    await store.put('students', student('s1'));
    const where = { groupId: 'g1' };
    const first = await store.list('students', where);
    expect(() => {
      first[0].name = 'changed';
    }).toThrow(TypeError);
    expect((await store.list('students', where))[0].name).toBe('s1');
    await store.put('answers', answer('c1', 1));
    const byId = await store.get('answers', 'c1:q1:s1');
    expect(() => {
      (byId as Answer).value = 9;
    }).toThrow(TypeError);
    expect((await store.get('answers', 'c1:q1:s1'))?.value).toBe(1);
  });
});
