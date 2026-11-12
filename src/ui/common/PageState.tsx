import { t } from '../../i18n';
import { RouteLink } from '../routing/useRoute';

export function Loading() {
  return <p className="muted page-state">{t.common.loading}</p>;
}

export function NotFound() {
  return (
    <div className="page-state stack">
      <h1 className="page__title">{t.common.notFoundTitle}</h1>
      <p className="muted">{t.common.notFoundBody}</p>
      <RouteLink to={{ name: 'home' }} className="btn btn--primary">
        {t.common.backHome}
      </RouteLink>
    </div>
  );
}
