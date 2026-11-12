/** Small rules about lists that more than one part of the domain needs. */

/** The single item of a list, else none: a lone choice needs no choosing. */
export const onlyOne = <T>(items: readonly T[]): T | null => (items.length === 1 ? items[0] : null);

/** The `order` a new item takes so that it goes last. */
export function nextOrder(items: readonly { order: number }[]): number {
  return items.reduce((last, item) => Math.max(last, item.order), 0) + 1;
}

export function sortByOrder<T extends { order: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}
