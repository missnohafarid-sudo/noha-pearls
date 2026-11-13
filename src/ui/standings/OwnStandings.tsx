import type { Session } from '../../domain/models';
import { PERIOD_KINDS, type PeriodKind } from '../../domain/periods';
import { t } from '../../i18n';
import { useAsked } from '../hooks/data';
import { useServices } from '../ServicesContext';
import { useStandingsVersion } from './useStandingsVersion';

const ts = t.standings;

function OwnStandingLine({ session, kind }: { session: Session; kind: PeriodKind }) {
  const { records } = useServices();
  const version = useStandingsVersion(session);
  const own = useAsked(() => records.ownStandingIn(session.id, kind), [records, session.id, kind, version]);
  if (!own) return null;
  return <p>{ts.own.line(ts.own.periodKind[kind], own)}</p>;
}

/** A named student's own cumulative results for this week and this month, from the seat this device was let in at. */
export function OwnStandings({ session }: { session: Session }) {
  return (
    <div className="stack stack--tight">
      {PERIOD_KINDS.map((kind) => (
        <OwnStandingLine key={kind} session={session} kind={kind} />
      ))}
    </div>
  );
}
