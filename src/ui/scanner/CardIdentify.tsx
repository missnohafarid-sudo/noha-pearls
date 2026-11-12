import { useCallback, useRef, useState } from 'react';
import { CardReadStabilizer, presenceReadings, type DetectedMarker } from '../../domain/cards';
import type { Student } from '../../domain/models';
import { cardLabel, studentByCard } from '../../domain/roster';
import { t } from '../../i18n';
import { CameraView } from './CameraView';
import { FullScreenOverlay } from '../common/FullScreenOverlay';
import { useCamera } from './useCamera';
import { useMarkerFrames } from './useMarkerFrames';

export interface CardIdentifyProps {
  students: readonly Student[];
  onIdentified: (student: Student) => void;
  onClose: () => void;
}

/** Full-screen overlay: a student holds her answer card up to the camera to say who she is. */
export function CardIdentify({ students, onIdentified, onClose }: CardIdentifyProps) {
  const camera = useCamera();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [stabilizer] = useState(() => new CardReadStabilizer());
  const done = useRef(false);

  const labelFor = useCallback((marker: DetectedMarker) => cardLabel(students, marker), [students]);
  const onMarkers = useCallback(
    (markers: readonly DetectedMarker[]) => {
      const stable = stabilizer.observeFrame(presenceReadings(markers));
      const student = stable.map((reading) => studentByCard(students, reading.cardNumber)).find(Boolean);
      if (!student || done.current) return;
      done.current = true;
      onIdentified(student);
    },
    [stabilizer, students, onIdentified],
  );
  useMarkerFrames({ videoRef: camera.videoRef, overlayRef, active: camera.ready, onMarkers, labelFor });

  return (
    <FullScreenOverlay label={t.scanner.identifyTitle} title={t.scanner.identifyHint} onClose={onClose}>
      <div className="scanner__body scanner__body--single">
        <CameraView camera={camera} overlayRef={overlayRef} />
      </div>
    </FullScreenOverlay>
  );
}
