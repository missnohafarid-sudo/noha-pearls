import { useMemo, useState } from 'react';
import type { Id, SchoolClass } from '../../domain/models';
import { shiftPeriod, type PeriodKind } from '../../domain/periods';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import { useAsked } from '../hooks/data';
import { useClassKeptCount } from '../hooks/byCode';
import { classRoute } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import { ClassSwitcher } from '../roster/ClassSwitcher';
import { useShownClass } from '../roster/useShownClass';
import { SchoolYearSection } from '../retention/SchoolYearSection';
import { PeriodKindButtons } from '../standings/PeriodKindButtons';
import { StandingsTables } from '../standings/StandingsTables';
import { useServices } from '../ServicesContext';

const ts = t.standings;

/** The classes to switch between, and the cumulative results of the one shown. */
export function StandingsPage({ classId }: { classId: Id | undefined }) {
  const found = useShownClass('standings', classId);
  const [kind, setKind] = useState<PeriodKind>('week');
  const [back, setBack] = useState(0);
  if (!found) return <Loading />;
  const { classes, shown } = found;

  return (
    <div className="page page--compact">
      <h1 className="page__title">{ts.title}</h1>
      <ClassSwitcher page="standings" classes={classes} current={shown} />
      {shown ? (
        <ClassStandings
          key={shown.id}
          schoolClass={shown}
          kind={kind}
          back={back}
          onKind={(next) => {
            setKind(next);
            setBack(0);
          }}
          onBack={setBack}
        />
      ) : classId === undefined || classes.length === 0 ? (
        <div className="stack stack--tight">
          <p className="muted">{ts.noClass}</p>
          <div className="row">
            <RouteLink to={classRoute('roster')} className="btn btn--small">
              {ts.toRoster}
            </RouteLink>
          </div>
        </div>
      ) : (
        <p className="muted">{t.roster.classNotFound}</p>
      )}
      <SchoolYearSection schoolClass={shown} />
    </div>
  );
}

interface PeriodProps {
  kind: PeriodKind;
  /** How many periods before the current one. */
  back: number;
  onKind: (kind: PeriodKind) => void;
  onBack: (back: number) => void;
}

/** One class list over a week or a month, now or earlier; the chosen period is kept by the page when the class is switched. */
function ClassStandings({ schoolClass, kind, back, onKind, onBack }: PeriodProps & { schoolClass: SchoolClass }) {
  const { records } = useServices();
  const current = useMemo(() => records.currentPeriod(kind), [records, kind]);
  const period = shiftPeriod(current, -back);
  const kept = useClassKeptCount(schoolClass.id);
  const found = useAsked(() => records.standingsOf(schoolClass.id, period), [records, schoolClass.id, period.kind, period.start, kept]);

  return (
    <>
      <header className="stack stack--tight">
        <div className="row">
          <PeriodKindButtons kind={kind} onKind={onKind} />
          <div className="row">
            <button type="button" className="btn btn--small" aria-label={ts.previousPeriod} onClick={() => onBack(back + 1)}>
              {t.common.previous}
            </button>
            <strong>{ts.periodLabel(period)}</strong>
            <button type="button" className="btn btn--small" aria-label={ts.nextPeriod} disabled={back === 0} onClick={() => onBack(back - 1)}>
              {t.common.next}
            </button>
          </div>
        </div>
        {found && (
          <>
            <p>{ts.classCount(found.classes)}</p>
            <p className="muted">{ts.note}</p>
          </>
        )}
      </header>
      {found === undefined ? <Loading /> : found.classes === 0 ? <p className="muted">{ts.empty}</p> : <StandingsTables standings={found} />}
    </>
  );
}
