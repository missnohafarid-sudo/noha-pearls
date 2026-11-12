import type { ReactNode } from 'react';
import type { SchoolClass } from '../../domain/models';
import { t } from '../../i18n';
import { classRoute, navigate, type ClassPageName } from '../routing/routes';

interface Props {
  page: ClassPageName;
  classes: readonly SchoolClass[];
  current: SchoolClass | null;
  /** Further controls after the class buttons. */
  children?: ReactNode;
}

/** One quiet button per class with the current one marked; each leads to `page`. */
export function ClassSwitcher({ page, classes, current, children }: Props) {
  return (
    <nav className="row" aria-label={t.roster.classesLabel}>
      {classes.map((schoolClass) => (
        <button
          key={schoolClass.id}
          type="button"
          className="btn btn--small"
          aria-pressed={schoolClass.id === current?.id}
          onClick={() => navigate(classRoute(page, schoolClass.id))}
        >
          {schoolClass.name}
        </button>
      ))}
      {children}
    </nav>
  );
}
