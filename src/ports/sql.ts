/** A value that can be bound to a statement or read from a column. */
export type SqlValue = string | number | null;

/**
 * The smallest synchronous SQL engine the document store needs. A Durable Object's storage and Node's
 * `node:sqlite` both satisfy it with a thin adapter; the store depends on this interface only.
 */
export interface SqlDatabase {
  /** Runs a statement that changes data; returns how many rows it wrote. */
  run(statement: string, ...params: SqlValue[]): number;
  /** Runs a query; returns every row as an object keyed by column name. */
  all<Row>(statement: string, ...params: SqlValue[]): Row[];
  /** Runs `work` so that all its statements are applied together, or none if it throws. */
  transaction<T>(work: () => T): T;
}
