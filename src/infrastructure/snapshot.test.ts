import { describe, expect, it } from 'vitest';
import { migrate, readMeta, SCHOOL_TABLES, writeMeta } from './sql/schema';
import { restoreSnapshot, takeSnapshot } from './sql/snapshot';
import { NodeSqlDatabase } from './testKit/NodeSqlDatabase';

function school(): NodeSqlDatabase {
  const db = new NodeSqlDatabase();
  migrate(db);
  return db;
}

describe('snapshot of the school data', () => {
  it('names every table a migrated database holds', () => {
    const made = school().all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map(({ name }) => name);
    expect([...SCHOOL_TABLES].sort()).toEqual(made.sort());
  });

  it('carries every table to a new database, replacing what that one made by itself', () => {
    const from = school();
    writeMeta(from, 'device-key', 'old key');
    from.run("INSERT INTO documents (collection, id, body) VALUES ('students', 's1', '{\"name\":\"Salma\"}')");
    from.run("INSERT INTO admin_sessions (id, expires_at) VALUES ('a1', 99)");
    const to = school();
    writeMeta(to, 'device-key', 'new key');
    to.run("INSERT INTO locks (subject, locked_until) VALUES ('x', 1)");

    to.transaction(() => restoreSnapshot(to, takeSnapshot(from)));

    expect(takeSnapshot(to)).toEqual(takeSnapshot(from));
    expect(readMeta(to, 'device-key')).toBe('old key');
  });

  it('changes nothing when a row cannot be restored', () => {
    const to = school();
    to.run("INSERT INTO locks (subject, locked_until) VALUES ('x', 1)");
    const before = takeSnapshot(to);

    expect(() => to.transaction(() => restoreSnapshot(to, { ...before, locks: [{ no_such_column: 1 }] }))).toThrow();
    expect(takeSnapshot(to)).toEqual(before);
  });
});
