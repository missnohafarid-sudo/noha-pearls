import { describe, expect, it } from 'vitest';
import type { Answer, Group, Student } from '../domain/models';
import { SqlDocumentStore } from './SqlDocumentStore';
import { CountingSql } from './testKit/CountingSql';
import { NodeSqlDatabase } from './testKit/NodeSqlDatabase';
import { UnitOfWork } from './UnitOfWork';

function setup() {
  const raw = new NodeSqlDatabase();
  const sql = new CountingSql(raw);
  const store = new SqlDocumentStore(sql);
  const count = (table: string, collection: string) => raw.all<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE collection = ?`, collection)[0].n;
  return { raw, sql, store, count };
}

const answer = (sessionId: string, n: number): Answer => ({
  id: `${sessionId}:q${n}:s1`, sessionId, slideId: `q${n}`, subject: { kind: 'student', id: 's1' }, value: 1, source: 'device', at: n,
});
const student = (id: string, groupId: string): Student => ({ id, name: id, cardNumber: 1, groupId });
const group = (id: string): Group => ({ id, classId: 'c1', name: id, color: 'red', order: 1 });

describe('packed rows', () => {
  it('keeps all the answers of a class in one row, and classes apart', async () => {
    const { store, count, sql } = setup();
    for (let n = 1; n <= 40; n += 1) await store.put('answers', answer('class-a', n));
    await store.put('answers', answer('class-b', 1));
    expect(count('packed_documents', 'answers')).toBe(2);
    expect(count('documents', 'answers')).toBe(0);
    sql.reset();
    expect(await store.list('answers', { sessionId: 'class-a' })).toHaveLength(40);
    expect(sql.rowsRead).toBe(1);
    sql.reset();
    await store.put('answers', answer('class-a', 41));
    expect(sql.rowsWritten).toBe(1);
    expect(await store.list('answers', { sessionId: 'class-b' })).toHaveLength(1);
  });

  it('rewrites the row when one document is removed, and leaves no row when the last one goes', async () => {
    const { store, count, sql } = setup();
    await store.put('answers', answer('class-a', 1));
    await store.put('answers', answer('class-a', 2));
    sql.reset();
    await store.remove('answers', 'class-a:q1:s1');
    expect(sql.rowsWritten).toBe(1);
    expect(count('packed_documents', 'answers')).toBe(1);
    await store.remove('answers', 'class-a:q2:s1');
    expect(count('packed_documents', 'answers')).toBe(0);
  });

  it('refuses an id that names another class', async () => {
    const { store } = setup();
    await expect(store.put('answers', { ...answer('class-a', 1), id: 'class-b:q1:s1' })).rejects.toThrow(/must start with its class/);
  });
});

describe('the field index', () => {
  it('reads only the matching documents for a filter on an indexed field', async () => {
    const { store, sql } = setup();
    for (let n = 0; n < 30; n += 1) await store.put('students', student(`s${n}`, n < 10 ? 'g1' : 'g2'));
    sql.reset();
    expect(await store.list('students', { groupId: 'g1' })).toHaveLength(10);
    expect(sql.rowsRead).toBe(20);
    sql.reset();
    expect(await store.list('students')).toHaveLength(30);
    expect(sql.rowsRead).toBe(30);
  });

  it('writes an index row only when the value changes', async () => {
    const { store, sql } = setup();
    await store.put('students', student('s1', 'g1'));
    sql.reset();
    await store.put('students', { ...student('s1', 'g1'), name: 'new' });
    expect(sql.rowsWritten).toBe(1);
    sql.reset();
    await store.update('students', 's1', (current) => ({ ...current, groupId: 'g2' }));
    expect(sql.rowsWritten).toBe(3);
    expect(await store.list('students', { groupId: 'g1' })).toEqual([]);
    expect(await store.list('students', { groupId: 'g2' })).toHaveLength(1);
    await store.remove('students', 's1');
    expect(await store.list('students', { groupId: 'g2' })).toEqual([]);
  });

  it('is rebuilt from the documents when the declared list differs from the stored one', async () => {
    const { raw, store } = setup();
    await store.put('students', student('s1', 'g1'));
    raw.run('DELETE FROM field_index');
    raw.run("UPDATE meta SET value = '{}' WHERE key = 'index-layout'");
    const reopened = new SqlDocumentStore(raw);
    expect(await reopened.list('students', { groupId: 'g1' })).toHaveLength(1);
  });

  it('survives reopening the same database', async () => {
    const { raw, store } = setup();
    await store.put('groups', group('g1'));
    expect(await new SqlDocumentStore(raw).get('groups', 'g1')).toMatchObject({ id: 'g1' });
  });
});

describe('a unit of work', () => {
  it('lets a command read its own writes before they are applied', async () => {
    const { store } = setup();
    const unit = new UnitOfWork(store);
    await store.put('students', student('s0', 'g1'));
    await unit.put('students', student('s1', 'g1'));
    await unit.remove('students', 's0');
    await unit.put('answers', answer('class-a', 1));
    expect((await unit.list('students', { groupId: 'g1' })).map((s) => s.id)).toEqual(['s1']);
    expect(await unit.get('students', 's0')).toBeNull();
    expect(await unit.list('answers', { sessionId: 'class-a' })).toHaveLength(1);
    expect(await store.get('students', 's1')).toBeNull();
    expect(await store.get('students', 's0')).not.toBeNull();
  });

  it('applies everything at commit and tells each watcher once, with the final state', async () => {
    const { store } = setup();
    const seen: number[] = [];
    const stop = store.watch('students', {}, (docs) => seen.push(docs.length));
    const unit = new UnitOfWork(store);
    await unit.put('students', student('s1', 'g1'));
    await unit.put('students', student('s2', 'g1'));
    await unit.update('students', 's1', (current) => ({ ...current, name: 'changed' }));
    expect(seen).toEqual([0]);
    unit.commit();
    stop();
    expect(seen).toEqual([0, 2]);
    expect(await store.get('students', 's1')).toMatchObject({ name: 'changed' });
  });

  it('applies nothing and tells nobody when the database fails part way', async () => {
    const { store, sql } = setup();
    await store.put('groups', group('g1'));
    const fired: number[] = [];
    const stop = store.watch('students', {}, (docs) => fired.push(docs.length));
    const unit = new UnitOfWork(store);
    await unit.put('students', student('s1', 'g1'));
    await unit.put('answers', answer('class-a', 1));
    await unit.remove('groups', 'g1');
    sql.reset();
    sql.failOnStatement = 4;
    expect(() => unit.commit()).toThrow('the database failed');
    sql.failOnStatement = 0;
    stop();
    expect(fired).toEqual([0]);
    expect(await store.list('students')).toEqual([]);
    expect(await store.list('answers')).toEqual([]);
    expect(await store.get('groups', 'g1')).not.toBeNull();
  });

  it('forgets its writes on rollback', async () => {
    const { store } = setup();
    const unit = new UnitOfWork(store);
    await unit.put('students', student('s1', 'g1'));
    unit.rollback();
    unit.commit();
    expect(await store.list('students')).toEqual([]);
  });
});
