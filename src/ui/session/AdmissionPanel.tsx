import type { ReactNode } from 'react';
import { admittedDevices, awaitingAdmission, isAdmitted, contestedRequestNumber, seatGroupId, seatsForBulkAdmission } from '../../domain/admission';
import type { Id, Participant, SessionRoster } from '../../domain/models';
import { presentStudents, rollTaken } from '../../domain/attendance';
import { groupById, studentById } from '../../domain/roster';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { AdminPanel } from '../shell/AdminPanel';
import { useServices } from '../ServicesContext';
import { WAITING_LIST_ID, WaitingCountButton } from './WaitingCountButton';

interface AdmissionPanelProps {
  sessionId: Id;
  participants: readonly Participant[];
  roster: SessionRoster;
  onScan: () => void;
}

/** Side-panel list of the devices waiting to be let in, and of those already inside. */
export function AdmissionPanel({ sessionId, participants, roster, onScan }: AdmissionPanelProps) {
  const { admission } = useServices();
  const { students, groups } = roster;
  const waiting = awaitingAdmission(participants);
  const inside = admittedDevices(participants);
  const bulk = seatsForBulkAdmission(participants);

  const removeButton = (device: Participant) => (
    <ConfirmButton className="btn btn--small btn--danger" onConfirm={() => void admission.remove(device.id)}>
      {t.session.admission.remove}
    </ConfirmButton>
  );

  const whoIs = (device: Participant): string => {
    if (device.studentId === null) return isAdmitted(device) ? t.join.sharedDeviceLabel : t.join.sharedDevice;
    return studentById(students, device.studentId)?.name ?? t.session.admission.unknownStudent;
  };

  const contestedChips = (device: Participant) => {
    const number = contestedRequestNumber(participants, device);
    return (
      number !== null && (
        <>
          <span className="chip">{t.session.admission.replacesOtherDevice}</span>
          <span className="chip">{t.session.admission.requestNumber(number)}</span>
        </>
      )
    );
  };

  const row = (device: Participant, action: ReactNode) => (
    <li key={device.id} className="admission__item">
      <span className="admission__who">
        <span>{whoIs(device)}</span>
        <span className="chip">{groupById(groups, seatGroupId(device, students))?.name}</span>
        {contestedChips(device)}
        {device.studentId === null && !isAdmitted(device) && <span className="chip chip--accent">{t.session.admission.answersForGroup}</span>}
      </span>
      {action}
    </li>
  );

  return (
    <AdminPanel
      title={t.session.admission.title}
      pinTitle
      titleExtra={waiting.length > 0 && <WaitingCountButton count={waiting.length} />}
    >
      <p className="muted">
        {rollTaken(roster) ? t.session.admission.present(presentStudents(roster).length, students.length) : t.session.admission.noRollYet}
      </p>
      {waiting.length === 0 ? (
        <p className="muted">{t.session.admission.nobodyWaiting}</p>
      ) : (
        <ul id={WAITING_LIST_ID} className="list-reset stack stack--tight admission__list">
          {waiting.map((device) =>
            row(
              device,
              <span className="row">
                <button type="button" className="btn btn--small" onClick={() => void admission.admit(device.id, device.studentId)}>
                  {t.session.admission.admit}
                </button>
                {removeButton(device)}
              </span>,
            ),
          )}
        </ul>
      )}
      {waiting.some((device) => device.studentId === null) && <p className="muted">{t.session.admission.sharedNote}</p>}
      {bulk.length >= 2 && (
        <button type="button" className="btn btn--small" onClick={() => void admission.admitAll(sessionId)}>
          {t.session.admission.admitAll}
        </button>
      )}
      <button type="button" className="btn btn--small" onClick={onScan}>
        {t.session.admission.scan}
      </button>
      <details>
        <summary className="summary-row">
          {t.session.admission.inside}
          <span className="chip">{inside.length}</span>
        </summary>
        <ul className="list-reset stack stack--tight">
          {inside.map((device) => row(device, removeButton(device)))}
        </ul>
      </details>
    </AdminPanel>
  );
}
