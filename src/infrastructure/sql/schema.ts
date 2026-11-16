import type { SqlDatabase } from '../../ports/sql';

/**
 * The tables, and how they change. Each entry of MIGRATIONS runs once, in order. The live hub holds data, so an entry is never
 * edited once deployed: a change of the tables is a new entry at the end.
 */
const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE documents (
       collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
       PRIMARY KEY (collection, id)
     ) WITHOUT ROWID`,
    `CREATE TABLE packed_documents (
       collection TEXT NOT NULL, owner TEXT NOT NULL, body TEXT NOT NULL,
       PRIMARY KEY (collection, owner)
     ) WITHOUT ROWID`,
    `CREATE TABLE field_index (
       collection TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, id TEXT NOT NULL,
       PRIMARY KEY (collection, field, value, id)
     ) WITHOUT ROWID`,
    'CREATE TABLE locks (subject TEXT NOT NULL PRIMARY KEY, locked_until INTEGER NOT NULL) WITHOUT ROWID',
    'CREATE TABLE window_events (subject TEXT NOT NULL PRIMARY KEY, times TEXT NOT NULL) WITHOUT ROWID',
    'CREATE TABLE admin_sessions (id TEXT NOT NULL PRIMARY KEY, expires_at INTEGER NOT NULL) WITHOUT ROWID',
    'CREATE TABLE daily_writes (day INTEGER NOT NULL PRIMARY KEY, rows INTEGER NOT NULL) WITHOUT ROWID',
  ],
];

const META_TABLE = 'meta';

/** Every table the schema makes: all of the school's data, and nothing of the platform's own. */
export const SCHOOL_TABLES: readonly string[] = [META_TABLE, ...MIGRATIONS.flat().flatMap((statement) => /^\s*CREATE TABLE (\w+)/.exec(statement)?.slice(1) ?? [])];

const SCHEMA_VERSION = 'schema-version';

/** The small table of facts about the database itself: its schema version and the layout of its index. */
export function readMeta(db: SqlDatabase, key: string): string | null {
  return db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)[0]?.value ?? null;
}

export function writeMeta(db: SqlDatabase, key: string, value: string): void {
  db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
}

/** Creates what is missing and applies the migrations not yet applied; safe to run on every start. */
export function migrate(db: SqlDatabase): void {
  db.run(`CREATE TABLE IF NOT EXISTS ${META_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID`);
  const applied = Number(readMeta(db, SCHEMA_VERSION) ?? 0);
  if (applied >= MIGRATIONS.length) return;
  db.transaction(() => {
    MIGRATIONS.slice(applied).forEach((statements) => statements.forEach((statement) => db.run(statement)));
    writeMeta(db, SCHEMA_VERSION, String(MIGRATIONS.length));
  });
}
