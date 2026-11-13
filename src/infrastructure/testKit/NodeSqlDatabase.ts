import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from '../../ports/sql';

/** `node:sqlite` as a `SqlDatabase`, for tests: an in-memory database unless given a file. */
export class NodeSqlDatabase implements SqlDatabase {
  private readonly database: DatabaseSync;
  private depth = 0;

  constructor(location = ':memory:') {
    this.database = new DatabaseSync(location);
  }

  run(statement: string, ...params: SqlValue[]): number {
    return Number(this.database.prepare(statement).run(...(params as SQLInputValue[])).changes);
  }

  all<Row>(statement: string, ...params: SqlValue[]): Row[] {
    return this.database.prepare(statement).all(...(params as SQLInputValue[])) as Row[];
  }

  transaction<T>(work: () => T): T {
    if (this.depth > 0) return work();
    this.database.exec('BEGIN');
    this.depth += 1;
    try {
      const result = work();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    } finally {
      this.depth -= 1;
    }
  }
}
