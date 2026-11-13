import { useState } from 'react';
import { RewardIndex } from '../../domain/analytics';
import { isAdmitted } from '../../domain/admission';
import type { Participant, Session, SessionRoster } from '../../domain/models';
import { t } from '../../i18n';
import { groupById, studentById } from '../../domain/roster';
import { OwnResults } from '../board/OwnResults';
import { useAnswers, useLesson, useRewards } from '../hooks/data';
import { OwnStandings } from '../standings/OwnStandings';
import { LeaveLink } from './LeaveLink';
import { StatusMessage } from './StatusMessage';

interface EndedScreenProps {
  session: Session;
  /** This device's seat; only a named, admitted one has results to show. */
  seat: Participant | null | undefined;
  roster: SessionRoster;
}

/** What a device shows once the class has ended: thanks, and her own results if she was in under her name. */
export function EndedScreen({ session, seat, roster }: EndedScreenProps) {
  const { groups, students } = roster;
  const lesson = useLesson(session.lessonId);
  const answers = useAnswers(session.id);
  const rewards = useRewards(session.id);
  const [hidden, setHidden] = useState(false);

  const student = seat && isAdmitted(seat) ? studentById(students, seat.studentId) : null;
  const group = student && groupById(groups, student.groupId);
  const message = (
    <StatusMessage title={t.join.ended} hint={t.join.endedHint}>
      <LeaveLink />
    </StatusMessage>
  );
  if (!student || !group || !lesson || !answers || !rewards) return message;

  return (
    <div className="stack">
      {message}
      {hidden ? (
        <button type="button" className="btn join__ended-action" onClick={() => setHidden(false)}>
          {t.join.myResults}
        </button>
      ) : (
        <OwnResults
          session={session}
          lesson={lesson}
          roster={roster}
          answers={answers}
          student={student}
          group={group}
          hearts={new RewardIndex(rewards).of({ kind: 'student', id: student.id })}
          onHide={() => setHidden(true)}
        >
          <OwnStandings session={session} />
        </OwnResults>
      )}
    </div>
  );
}
