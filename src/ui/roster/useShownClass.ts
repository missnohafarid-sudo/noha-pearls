import type { Id, SchoolClass } from '../../domain/models';
import { schoolClassForPage } from '../../domain/roster';
import { useClasses } from '../hooks/data';
import { classRoute, type ClassPageName } from '../routing/routes';
import { useFillAddress } from '../routing/useFillAddress';

export interface ShownClass {
  classes: SchoolClass[];
  /** The class the page shows; null when there is none to show. */
  shown: SchoolClass | null;
}

/**
 * The school class a page about one class shows, by the rule in `domain/roster.ts`; `undefined` while loading.
 * When the rule picks the class, the address takes its id, so a reload or a bookmark stays on that class.
 */
export function useShownClass(page: ClassPageName, classId: Id | undefined): ShownClass | undefined {
  const classes = useClasses();
  const shown = classes ? schoolClassForPage(classes, classId) : null;

  useFillAddress(classId === undefined && shown ? classRoute(page, shown.id) : null);

  return classes && { classes, shown };
}
