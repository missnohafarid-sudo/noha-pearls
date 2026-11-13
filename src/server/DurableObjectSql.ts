import type { SqlDatabase, SqlValue } from '../ports/sql';

/** A Durable Object's own SQLite storage as a `SqlDatabase`. */
export class DurableObjectSql implements SqlDatabase {
  constructor(private readonly storage: DurableObjectStorage) {}

  run(statement: string, ...params: SqlValue[]): number {
    const cursor = this.storage.sql.exec(statement, ...params);
    cursor.toArray();
    return cursor.rowsWritten;
  }

  all<Row>(statement: string, ...params: SqlValue[]): Row[] {
    return this.storage.sql.exec(statement, ...params).toArray() as Row[];
  }

  transaction<T>(work: () => T): T {
    return this.storage.transactionSync(work);
  }
}
