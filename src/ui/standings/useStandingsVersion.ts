import type { Session } from '../../domain/models';
import { useKeptRecordCount, useRewards } from '../hooks/data';

/** Changes whenever what the cumulative results are summed from changes: a class of this list is kept, or a heart is given in this class. */
export function useStandingsVersion(session: Session): string {
  const kept = useKeptRecordCount(session.classId);
  const hearts = useRewards(session.id);
  return `${kept}:${hearts?.length}`;
}
