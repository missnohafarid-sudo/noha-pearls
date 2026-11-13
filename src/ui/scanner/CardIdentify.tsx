import { useCallback, useRef, useState } from 'react';
import { CardReadStabilizer, cardNumberLabel, presenceReadings, type DetectedMarker } from '../../domain/cards';
import { t } from '../../i18n';
import { CameraView } from './CameraView';
import { FullScreenOverlay } from '../common/FullScreenOverlay';
import { useCamera } from './useCamera';
import { useMarkerFrames } from './useMarkerFrames';

export interface CardIdentifyProps {
  onCard: (cardNumber: number) => void;
  onClose: () => void;
}

/** Full-screen overlay: a student holds her answer card up to the camera. It reports the number it reads, never who holds it. */
export function CardIdentify({ onCard, onClose }: CardIdentifyProps) {
  const camera = useCamera();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [stabilizer] = useState(() => new CardReadStabilizer());

  const onMarkers = useCallback(
    (markers: readonly DetectedMarker[]) => {
      for (const reading of stabilizer.observeFrame(presenceReadings(markers))) onCard(reading.cardNumber);
    },
    [stabilizer, onCard],
  );
  useMarkerFrames({ videoRef: camera.videoRef, overlayRef, active: camera.ready, onMarkers, labelFor: cardNumberLabel });

  return (
    <FullScreenOverlay label={t.scanner.identifyTitle} title={t.scanner.identifyHint} onClose={onClose}>
      <div className="scanner__body scanner__body--single">
        <CameraView camera={camera} overlayRef={overlayRef} />
      </div>
    </FullScreenOverlay>
  );
}
