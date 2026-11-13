import { isAdmitted, isSeatOfGroupPage, seatGroupId } from '../../domain/admission';
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
import { useMyParticipant, useSessionByCode } from '../hooks/data';
import { useNameClaims, useSeenRoster } from '../hooks/byCode';
import { useServices } from '../ServicesContext';
import './join.css';

/** A student's phone or tablet: pick a name, then follow the teacher and answer. Drawn without the site frame. */
export function JoinPage({ code, groupId }: { code: string; groupId: string }) {
  const { participants } = useServices();
  const session = useSessionByCode(code);
  const seen = useSeenRoster(session?.code);
  const participant = useMyParticipant(session?.id);
  const claims = useNameClaims(session?.code);
  const { lost, leave } = useSeatLost(participant);

  const invalid = <StatusMessage title={t.join.invalidLink} hint={t.join.invalidLinkHint} />;
  let content;
  if (session === undefined) {
    content = <Loading />;
  } else if (session === null) {
    content = invalid;
  } else if (seen === undefined) {
    content = <Loading />;
  } else if (!isLive(session)) {
    content = <EndedScreen session={session} roster={seen} seat={participant} />;
  } else {
    const { groups, students } = seen;
    const group = groupById(groups, groupId);
    if (!group) content = invalid;
    else if (participant === undefined || claims === undefined) content = <Loading />;
    else if (participant === null || !isSeatOfGroupPage(participant, groupId, students)) {
      content = (
        <NamePicker
          key={groupId}
          group={group}
          session={session}
          lost={lost}
          students={membersOf(groupId, students)}
          heldIds={claims.heldByOthers}
          onPick={(studentId) => void participants.join(session.code, groupId, studentId)}
        />
      );
    } else if (!isAdmitted(participant)) {
      content = (
        <AdmissionWaiting
          named={participant.studentId !== null}
          requestNumber={claims.requestNumber}
          onChangeName={() => void leave(session.id)}
        />
      );
    } else {
      const seatGroup = groupById(groups, seatGroupId(participant, students)) ?? group;
      content = <DeviceScreen session={session} group={seatGroup} participant={participant} roster={seen} onChooseName={() => void leave(session.id)} />;
    }
  }

  return <main className="join">{content}</main>;
}
