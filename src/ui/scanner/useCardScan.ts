import { useCallback, useState, type RefObject } from 'react';
import { choiceFromCorners, CardReadStabilizer, type DetectedMarker } from '../../domain/cards';
import type { ChoiceSlide, Session, Student } from '../../domain/models';
import { studentByCard } from '../../domain/roster';
import { choiceLetter } from '../../i18n';
import { useServices } from '../ServicesContext';
import { useMarkerFrames } from './useMarkerFrames';

interface ScanInput {
  session: Session;
  slide: ChoiceSlide;
  students: readonly Student[];
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  /** Scan only while the camera delivers frames. */
  active: boolean;
}

export interface CardScan {
  /** Makes the next stable reading of this card count again (after a manual change or a refused answer). */
  forget: (cardNumber: number) => void;
}

/** Records stable card readings as answers to the slide. */
export function useCardScan({ session, slide, students, videoRef, overlayRef, active }: ScanInput): CardScan {
  const services = useServices();
  const [stabilizer] = useState(() => new CardReadStabilizer());

  const labelFor = useCallback(
    (marker: DetectedMarker) => {
      if (!studentByCard(students, marker.id)) return null;
      const choice = choiceFromCorners(marker.corners);
      return choice < slide.options.length ? `${marker.id} ${choiceLetter(choice)}` : null;
    },
    [students, slide],
  );
  const onMarkers = useCallback(
    (markers: readonly DetectedMarker[]) => {
      const readings = markers.map((marker) => ({ cardNumber: marker.id, choice: choiceFromCorners(marker.corners) }));
      for (const { cardNumber, choice } of stabilizer.observeFrame(readings)) {
        const student = studentByCard(students, cardNumber);
        if (!student) continue;
        services.answers
          .submitForStudent(session.id, slide.id, student.id, choice, 'card')
          .then((accepted) => {
            if (!accepted) stabilizer.forget(cardNumber);
          })
          .catch(() => stabilizer.forget(cardNumber));
      }
    },
    [stabilizer, students, services, session.id, slide.id],
  );

  useMarkerFrames({ videoRef, overlayRef, active, onMarkers, labelFor });
  return { forget: useCallback((cardNumber: number) => stabilizer.forget(cardNumber), [stabilizer]) };
}
