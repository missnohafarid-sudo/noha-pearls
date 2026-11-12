import { cleanName } from '../domain/text';

export class NameError extends Error {
  readonly code = 'name-blank';

  constructor() {
    super('name-blank');
    this.name = 'NameError';
  }
}

/** The name without surrounding blanks; a blank one is refused the same way everywhere. */
export function requireName(raw: string): string {
  const cleaned = cleanName(raw);
  if (cleaned === null) throw new NameError();
  return cleaned;
}
