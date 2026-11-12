import { t } from '../../i18n';
import { RouteLink } from '../routing/useRoute';

/** Goes to the home page and nothing else: the device keeps its seat, so one tap by mistake costs nothing. */
export function LeaveLink() {
  return (
    <RouteLink to={{ name: 'home' }} className="btn btn--small join__leave">
      {t.common.backHome}
    </RouteLink>
  );
}
