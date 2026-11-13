import type { CollectionName, Collections, Where } from '../ports/store';

type FilterValue = string | number | boolean | null;

/** The only values a filter may ask for: text, a finite number, true or false, or null. */
export const isFilterValue = (value: unknown): value is FilterValue =>
  value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

/** Fields that name a document or its class: every stored one is text, so a filter on one of them must be text too. */
const KEY_FIELDS = ['id', 'sessionId'];

/** Whether a filter can match anything: every value is a filter value, and the key fields are text. Anything else matches nothing, and nothing is read for it. */
export function isUsableFilter(where: object): boolean {
  return Object.entries(where).every(([field, value]) => isFilterValue(value) && (!KEY_FIELDS.includes(field) || typeof value === 'string'));
}

/** The one definition of an equality filter over top-level fields. */
export function matchesWhere<C extends CollectionName>(doc: Collections[C], where: Where<Collections[C]>): boolean {
  return isUsableFilter(where) && (Object.entries(where) as [keyof Collections[C], unknown][]).every(([field, value]) => doc[field] === value);
}
