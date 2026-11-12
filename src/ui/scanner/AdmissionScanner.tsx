import { useCallback, useRef, useState } from 'react';
import { CardReadStabilizer, presenceReadings, type DetectedMarker } from '../../domain/cards';
import { isOnRoll, sightingChangesAnything } from '../../domain/attendance';
import { admittedDevices, seatsNeedingTap } from '../../domain/admission';
import type { Participant, Session, SessionRoster } from '../../domain/models';
import { cardLabel, studentByCard } from '../../domain/roster';
import { t } from '../../i18n';
import { useServices } from '../ServicesContext';
import { CameraView } from './CameraView';
import { FullScreenOverlay } from '../common/FullScreenOverlay';
import { useCamera } from './useCamera';
import { useMarkerFrames } from './useMarkerFrames';

interface AdmissionScannerProps {
  session: Session;
  roster: SessionRoster;
  /** Every device of the session; the scanner lets in the waiting ones whose card it sees. */
  participants: readonly Participant[];
  onClose: () => void;
}

/** Full-screen overlay: the teacher sweeps the room; each raised card marks its owner present and lets in her waiting device. */
export function AdmissionScanner({ session, roster, participants, onClose }: AdmissionScannerProps) {
  const { admission } = useServices();
  const camera = useCamera();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [stabilizer] = useState(() => new CardReadStabilizer());
  const { students } = roster;

  const labelFor = useCallback((marker: DetectedMarker) => cardLabel(students, marker), [students]);
  const onMarkers = useCallback(
    (markers: readonly DetectedMarker[]) => {
      for (const { cardNumber } of stabilizer.observeFrame(presenceReadings(markers))) {
        const student = studentByCard(students, cardNumber);
        if (student && sightingChangesAnything(roster, participants, student.id)) {
          admission.takeRoll(session.id, [student.id]).catch(() => undefined);
        }
        stabilizer.forget(cardNumber);
      }
    },
    [stabilizer, students, roster, participants, admission, session.id],
  );
  useMarkerFrames({ videoRef: camera.videoRef, overlayRef, active: camera.ready, onMarkers, labelFor });

  const admittedIds = new Set(admittedDevices(participants).map((p) => p.studentId));
  const needTapIds = new Set(seatsNeedingTap(participants).map((p) => p.studentId));

  return (
    <FullScreenOverlay label={t.scanner.admitTitle} title={t.scanner.admitHint} onClose={onClose}>
      <div className="scanner__body">
        <CameraView camera={camera} overlayRef={overlayRef} />
        <aside className="scanner__side stack">
          <h3>{t.scanner.admitRoll}</h3>
          <ul className="list-reset stack--tight stack">
            {students.map((student) => (
              <li key={student.id} className="scanner__student-row">
                <span className="chip">{student.cardNumber}</span>
                <span className="scanner__student-name">{student.name}</span>
                {needTapIds.has(student.id) ? (
                  <span className="muted">{t.scanner.needsTap}</span>
                ) : (
                  admittedIds.has(student.id) && <strong>{t.scanner.admitted}</strong>
                )}
                {isOnRoll(roster, student.id) && <span className="chip chip--ok">{t.common.present}</span>}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </FullScreenOverlay>
  );
}
