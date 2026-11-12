import { t } from '../../i18n';
import { useClearingNotices } from '../hooks/data';
import { classRoute } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';

/** Tells the admin that the students' data is about to be deleted, with a link to where the date is changed, and for a week after that it was deleted. Nothing otherwise. */
export function ClearingNotice() {
  const notices = useClearingNotices();
  if (!notices) return null;
  return (
    <>
      {notices.coming && (
        <div className="notice stack stack--tight">
          <p>{t.retention.notice(notices.coming)}</p>
          <div className="row">
            <RouteLink to={classRoute('standings')} className="btn btn--small">
              {t.retention.toResults}
            </RouteLink>
          </div>
        </div>
      )}
      {notices.done && <p className="notice">{t.retention.done(notices.done)}</p>}
    </>
  );
}
