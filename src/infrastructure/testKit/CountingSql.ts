import type { SqlDatabase, SqlValue } from '../../ports/sql';

/**
 * Wraps a `SqlDatabase` to count the rows it reads and writes (the two numbers the hosting plan limits), and to
 * fail on a chosen statement to test that a failed command applies nothing.
 */
export class CountingSql implements SqlDatabase {
  rowsRead = 0;
  rowsWritten = 0;
  statements = 0;
  /** The number of the statement (counting from 1, from now) that throws; 0 for none. */
  failOnStatement = 0;

  constructor(private readonly inner: SqlDatabase) {}

  run(statement: string, ...params: SqlValue[]): number {
    this.count();
    const written = this.inner.run(statement, ...params);
    this.rowsWritten += written;
    return written;
  }

  all<Row>(statement: string, ...params: SqlValue[]): Row[] {
    this.count();
    const rows = this.inner.all<Row>(statement, ...params);
    this.rowsRead += rows.length;
    return rows;
  }

  transaction<T>(work: () => T): T {
    return this.inner.transaction(work);
  }

  reset(): void {
    this.rowsRead = 0;
    this.rowsWritten = 0;
    this.statements = 0;
  }

  private count(): void {
    this.statements += 1;
    if (this.failOnStatement > 0 && this.statements === this.failOnStatement) throw new Error('the database failed');
  }
}
