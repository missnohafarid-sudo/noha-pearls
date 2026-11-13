import { t } from '../../i18n';
import { useConnected } from '../hooks/data';
import { useTurnedAway } from '../hooks/useTurnedAway';

const REASONS = { rate: t.shell.limits.closedForRate, device: t.shell.limits.closedForDevice, network: t.shell.limits.closedForNetwork };

/** A calm line at the top of the page while the connection is down and the page is trying again; it says so when the hub turned the page away. */
export function ConnectionNotice() {
  const connected = useConnected();
  const turnedAway = useTurnedAway();
  if (connected) return null;
  return (
    <p className="shell__notice" role="status">
      {turnedAway ? REASONS[turnedAway] : t.shell.connection.notice}
    </p>
  );
}
