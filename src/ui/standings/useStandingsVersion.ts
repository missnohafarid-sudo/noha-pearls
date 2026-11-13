import type { Session } from '../../domain/models';
import { useHeartCount, useKeptRecordCount } from '../hooks/byCode';

/** Changes whenever what the cumulative results are summed from changes: a class of this list is kept, or a heart is given in this class. */
export function useStandingsVersion(session: Session): string {
  const kept = useKeptRecordCount(session.code);
  const hearts = useHeartCount(session.code);
  return `${kept}:${hearts}`;
}
