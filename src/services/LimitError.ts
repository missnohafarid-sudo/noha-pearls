export type LimitCode = 'lookups' | 'joins' | 'seats-full' | 'hearts-used' | 'answer-changes' | 'day-used' | 'watches';

/** A share was used up: the page shows the matching words and nothing was changed. */
export class LimitError extends Error {
  constructor(readonly code: LimitCode) {
    super(code);
    this.name = 'LimitError';
  }
}

/** Throws the error for `code` unless `allowed`. */
export function requireWithin(allowed: boolean, code: LimitCode): void {
  if (!allowed) throw new LimitError(code);
}
