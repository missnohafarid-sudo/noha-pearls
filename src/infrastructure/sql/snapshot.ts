import type { SqlDatabase, SqlValue } from '../../ports/sql';
import { SCHOOL_TABLES } from './schema';

/** Every row of every table the schema made, by table: all of the school's data, as one value that can be carried to another database. */
export type Snapshot = Record<string, Record<string, SqlValue>[]>;

export function takeSnapshot(db: SqlDatabase): Snapshot {
  return Object.fromEntries(SCHOOL_TABLES.map((table) => [table, db.all<Record<string, SqlValue>>(`SELECT * FROM ${table}`)]));
}

/** Makes each of the school's tables hold exactly its rows in the snapshot. Run it inside a transaction, with what must count only together with it. */
export function restoreSnapshot(db: SqlDatabase, snapshot: Snapshot): void {
  for (const table of SCHOOL_TABLES) {
    db.run(`DELETE FROM ${table}`);
    for (const row of snapshot[table] ?? []) {
      const columns = Object.keys(row);
      db.run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, ...Object.values(row));
    }
  }
}
