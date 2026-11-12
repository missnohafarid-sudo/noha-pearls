import type { ReactNode } from 'react';

/** A full-width friendly message on the student page: invalid link, ended class, waiting. `children` holds an action. */
export function StatusMessage({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="page-state stack">
      <h1 className="page__title">{title}</h1>
      {hint && <p className="muted">{hint}</p>}
      {children}
    </div>
  );
}
