import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../hooks/data';

/** The element the shell reserves for the editing panel; null when there is none. */
export const PanelHostContext = createContext<HTMLElement | null>(null);

interface AdminPanelProps {
  title: string;
  /** Shown at the end of the title row, e.g. a count. */
  titleExtra?: ReactNode;
  /** Keeps the title row at the top of the scrolling panel, whichever section is in view. */
  pinTitle?: boolean;
  children: ReactNode;
}

/**
 * A page's editing tools. Rendered into the side panel for the admin and not
 * rendered at all for anyone else: this is the one place that decides it.
 */
export function AdminPanel({ title, titleExtra, pinTitle = false, children }: AdminPanelProps) {
  const admin = useAdmin();
  const host = useContext(PanelHostContext);
  if (!admin || !host) return null;
  return createPortal(
    <section className={pinTitle ? 'panel-section panel-section--pinned' : 'panel-section'}>
      <div className="panel-section__head">
        <h2 className="panel-section__title">{title}</h2>
        {titleExtra}
      </div>
      {pinTitle ? <div className="stack">{children}</div> : children}
    </section>,
    host,
  );
}
