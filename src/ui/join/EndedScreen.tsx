import { useState } from 'react';
import { isAdmitted } from '../../domain/admission';
import type { Participant, Session } from '../../domain/models';
import { resultsReport } from '../../domain/resultRows';
import { groupById, studentById } from '../../domain/roster';
import type { SeenRoster } from '../../domain/visibility';
import { t } from '../../i18n';
import { MyResults } from '../board/MyResults';
import { useSeatView } from '../hooks/data';
import { OwnStandings } from '../standings/OwnStandings';
import { LeaveLink } from './LeaveLink';
import { StatusMessage } from './StatusMessage';

interface EndedScreenProps {
  session: Session;
  /** This device's seat; only a named, admitted one has results to show. */
  seat: Participant | null | undefined;
  roster: SeenRoster;
}

/** What a device shows once the class has ended: thanks, and her own results if she was in under her name. */
export function EndedScreen({ session, seat, roster }: EndedScreenProps) {
  const mine = useSeatView(session.id);
  const [hidden, setHidden] = useState(false);

  const student = seat && isAdmitted(seat) ? studentById(roster.students, seat.studentId) : null;
  const group = student && groupById(roster.groups, student.groupId);
  const own = mine?.own;
  const message = (
    <StatusMessage title={t.join.ended} hint={t.join.endedHint}>
      <LeaveLink />
    </StatusMessage>
  );
  if (!student || !group || !own?.report) return message;

  return (
    <div className="stack">
      {message}
      {hidden ? (
        <button type="button" className="btn join__ended-action" onClick={() => setHidden(false)}>
          {t.join.myResults}
        </button>
      ) : (
        <MyResults student={student} group={group} report={resultsReport(own.report)} hearts={own.hearts} onHide={() => setHidden(true)}>
          <OwnStandings session={session} />
        </MyResults>
      )}
    </div>
  );
}
