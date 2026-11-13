import { useRef } from 'react';
import { effectiveAnswer, nextManualChoiceFor, tallyAnswerers } from '../../domain/answering';
import { tallyChoices } from '../../domain/analytics';
import type { Answer, ChoiceSlide, Participant, Session, SessionRoster, Student } from '../../domain/models';
import { choiceLetter, t } from '../../i18n';
import { useServices } from '../ServicesContext';
import { CameraView } from './CameraView';
import { FullScreenOverlay } from '../common/FullScreenOverlay';
import { useCamera } from './useCamera';
import { useCardScan } from './useCardScan';

export interface CardScannerProps {
  session: Session;
  /** The question being answered. Cards carry one of up to four options. */
  slide: ChoiceSlide;
  roster: SessionRoster;
  participants: readonly Participant[];
  /** All answers of the session; the scanner shows who has answered this slide. */
  answers: readonly Answer[];
  onClose: () => void;
}

/** Full-screen overlay: camera view with detected cards, live results, and a manual fallback. */
export function CardScanner({ session, slide, roster, participants, answers, onClose }: CardScannerProps) {
  const camera = useCamera();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const scan = useCardScan({ session, slide, students: roster.students, videoRef: camera.videoRef, overlayRef, active: camera.ready });

  return (
    <FullScreenOverlay label={t.scanner.title} title={slide.prompt} onClose={onClose}>
      <div className="scanner__body">
        <CameraView camera={camera} overlayRef={overlayRef} />
        <ScanResults session={session} slide={slide} roster={roster} participants={participants} answers={answers} forget={scan.forget} />
      </div>
    </FullScreenOverlay>
  );
}

type ResultsProps = Omit<CardScannerProps, 'onClose'> & { forget: (cardNumber: number) => void };

/** Counts per option, plus every student's answer, tappable to set it by hand. */
function ScanResults({ session, slide, roster, participants, answers, forget }: ResultsProps) {
  const { answers: answerService } = useServices();
  const counts = tallyChoices(slide, roster, participants, answers);
  const { answered, expected } = tallyAnswerers(slide, roster, participants, answers);

  const cycle = (student: Student) => {
    const next = nextManualChoiceFor(effectiveAnswer(roster, answers, slide, student.id), slide.options.length);
    // Whatever the hand did, the camera may read this card again afterwards.
    const done = next === null
      ? answerService.clearForStudent(session.id, slide.id, student.id)
      : answerService.submitForStudent(session.id, slide.id, student.id, next, 'manual');
    void done.catch(() => undefined).finally(() => forget(student.cardNumber));
  };

  return (
    <aside className="scanner__side stack">
      <h3>{t.scanner.results}</h3>
      <p>{t.common.answeredCount(answered, expected)}</p>
      <div className="stack stack--tight">
        {slide.options.map((_, index) => (
          <div key={index} className="scanner__tally">
            <span className="scanner__letter">{choiceLetter(index)}</span>
            <span className="bar">
              <span className="bar__fill" style={{ inlineSize: `${expected > 0 ? (counts[index] / expected) * 100 : 0}%` }} />
            </span>
            <span>{counts[index]}</span>
          </div>
        ))}
      </div>
      <h3>{t.scanner.students}</h3>
      <p className="muted">{t.scanner.manualHint}</p>
      <ul className="list-reset stack--tight stack">
        {roster.students.map((student) => {
          const found = effectiveAnswer(roster, answers, slide, student.id);
          const choice = typeof found?.answer.value === 'number' ? found.answer.value : null;
          return (
            <li key={student.id}>
              <button type="button" className="btn scanner__student" onClick={() => cycle(student)}>
                <span className="chip">{student.cardNumber}</span>
                <span className="scanner__student-name">{student.name}</span>
                {found?.from === 'group' && <span className="chip">{t.common.groupAnswer}</span>}
                <strong>{choice === null ? t.scanner.noAnswer : choiceLetter(choice)}</strong>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
