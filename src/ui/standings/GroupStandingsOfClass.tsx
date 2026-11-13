import { useMemo, useState } from 'react';
import type { Session } from '../../domain/models';
import type { PeriodKind } from '../../domain/periods';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import { useAsked } from '../hooks/data';
import { useServices } from '../ServicesContext';
import { useStandingsVersion } from './useStandingsVersion';
import { GroupStandingsTable } from './StandingsTables';
import { PeriodKindButtons } from './PeriodKindButtons';

const ts = t.standings;

/** What anyone may see of a class list's cumulative results: the groups over this week or this month. */
export function GroupStandingsOfClass({ session }: { session: Session }) {
  const { records } = useServices();
  const [kind, setKind] = useState<PeriodKind>('week');
  const period = useMemo(() => records.currentPeriod(kind), [records, kind]);
  const version = useStandingsVersion(session);
  const groups = useAsked(() => records.groupStandingsOf(session.code, kind), [records, session.code, kind, version]);

  return (
    <section className="stack">
      <h2 className="card__title">{ts.title}</h2>
      <div className="row">
        <PeriodKindButtons kind={kind} onKind={setKind} />
        <strong>{ts.periodLabel(period)}</strong>
      </div>
      <p className="muted">{ts.boardNote}</p>
      {groups === undefined ? <Loading /> : groups.length === 0 ? <p className="muted">{ts.empty}</p> : <GroupStandingsTable groups={groups} />}
    </section>
  );
}
