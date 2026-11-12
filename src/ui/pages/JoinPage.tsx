import { contestedRequestNumber, isAdmitted, isSeatOfGroupPage, namesHeldByOthers, seatGroupId } from '../../domain/admission';
import { groupById, membersOf } from '../../domain/roster';
import { isLive } from '../../domain/sessions';
import { t } from '../../i18n';
import { AdmissionWaiting } from '../join/AdmissionWaiting';
import { EndedScreen } from '../join/EndedScreen';
import { useSeatLost } from '../join/useSeatLost';
import { NamePicker } from '../join/NamePicker';
import { DeviceScreen } from '../join/DeviceScreen';
import { StatusMessage } from '../join/StatusMessage';
import { Loading } from '../common/PageState';
import { useMyParticipant, useParticipants, useSessionByCode, useSessionRoster } from '../hooks/data';
import { useServices } from '../ServicesContext';
import './join.css';

/** A student's phone or tablet: pick a name, then follow the teacher and answer. Drawn without the site frame. */
export function JoinPage({ code, groupId }: { code: string; groupId: string }) {
  const { participants } = useServices();
  const session = useSessionByCode(code);
  const roster = useSessionRoster(session);
  const participant = useMyParticipant(session?.id);
  const everyone = useParticipants(session?.id);
  const { lost, leave } = useSeatLost(participant);

  const invalid = <StatusMessage title={t.join.invalidLink} hint={t.join.invalidLinkHint} />;
  let content;
  if (session === undefined) {
    content = <Loading />;
  } else if (session === null) {
    content = invalid;
  } else if (roster === undefined) {
    content = <Loading />;
  } else if (!isLive(session)) {
    content = <EndedScreen session={session} groups={roster.groups} seat={participant} students={roster.students} />;
  } else {
    const { groups, students } = roster;
    const group = groupById(groups, groupId);
    if (!group) content = invalid;
    else if (participant === undefined || everyone === undefined) content = <Loading />;
    else if (participant === null || !isSeatOfGroupPage(participant, groupId, students)) {
      content = (
        <NamePicker
          key={groupId}
          group={group}
          session={session}
          lost={lost}
          students={membersOf(groupId, students)}
          heldIds={namesHeldByOthers(everyone, participant?.id ?? null)}
          onPick={(studentId) => void participants.join(session.id, groupId, studentId)}
        />
      );
    } else if (!isAdmitted(participant)) {
      content = (
        <AdmissionWaiting
          named={participant.studentId !== null}
          requestNumber={contestedRequestNumber(everyone, participant)}
          onChangeName={() => void leave(session.id)}
        />
      );
    } else {
      const seatGroup = groupById(groups, seatGroupId(participant, students)) ?? group;
      content = <DeviceScreen session={session} group={seatGroup} participant={participant} roster={roster} onChooseName={() => void leave(session.id)} />;
    }
  }

  return <main className="join">{content}</main>;
}
