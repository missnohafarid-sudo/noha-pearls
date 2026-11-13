import type { CollectionName, Collections, Where } from '../ports/store';

/** The one definition of an equality filter over top-level fields. */
export function matchesWhere<C extends CollectionName>(doc: Collections[C], where: Where<Collections[C]>): boolean {
  return (Object.entries(where) as [keyof Collections[C], unknown][]).every(([field, value]) => doc[field] === value);
}
