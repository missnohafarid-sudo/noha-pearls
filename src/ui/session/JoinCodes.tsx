import { admittedDevices, seatGroupId } from '../../domain/admission';
import type { Group, Participant, Session, Student } from '../../domain/models';
import { t } from '../../i18n';
import { QrCode } from '../common/QrCode';
import { toneStyle } from '../common/tone';
import { routeUrl, siteAddress } from '../routing/routes';

/** The session code and site address for devices without a camera, then one QR card per group; testers can open the same link in a new tab. */
interface JoinCodesProps {
  session: Session;
  groups: readonly Group[];
  students: readonly Student[];
  participants: readonly Participant[];
}

export function JoinCodes({ session, groups, students, participants }: JoinCodesProps) {
  return (
    <div className="stack join-codes">
      <div className="stack stack--tight">
        <span className="muted">{t.session.joinCode}</span>
        <bdi dir="ltr" className="join-codes__code">{session.code}</bdi>
        <p>{t.session.joinWithoutCamera}</p>
        <bdi dir="ltr" className="join-codes__address">{siteAddress()}</bdi>
      </div>
      <div className="grid">
        {groups.map((group) => {
          const url = routeUrl({ name: 'join', code: session.code, groupId: group.id });
          return (
            <div key={group.id} className="card card--tone stack" style={toneStyle(group.color)}>
              <h2 className="card__title">{group.name}</h2>
              <QrCode url={url} label={t.session.qrLabel(group.name)} />
              <p className="muted">{t.session.joinedDevices(admittedDevices(participants).filter((p) => seatGroupId(p, students) === group.id).length)}</p>
              <a href={url} target="_blank" rel="noreferrer" className="join-codes__link">
                {t.session.openAsDevice}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
