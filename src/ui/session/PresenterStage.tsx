import { answersForSlide, tallyChoices } from '../../domain/analytics';
import { isQuestion, type AnswerTally } from '../../domain/answering';
import type { Answer, Participant, Session, SessionRoster, Slide } from '../../domain/models';
import { subjectName } from '../../domain/roster';
import { t } from '../../i18n';
import { useAdmin } from '../hooks/data';
import { SlideView } from '../slides/SlideView';
import { PEARL_PANEL_ID } from './pearlPanel/panelId';

interface Props {
  session: Session;
  slide: Slide | undefined;
  answers: readonly Answer[];
  roster: SessionRoster;
  participants: readonly Participant[];
  /** How far the question on screen is answered; null when the slide is no question. */
  tally: AnswerTally | null;
  /** Opens the pearl panel; null while it is open. */
  onOpenPanel: (() => void) | null;
}

/** The current slide, read-only, with live tallies and the wall of text answers. */
export function PresenterStage({ session, slide, answers, roster, participants, tally, onOpenPanel }: Props) {
  const admin = useAdmin();
  if (!slide) return <p className="muted">{t.session.noSlide}</p>;
  const given = answersForSlide(answers, slide.id);
  const question = isQuestion(slide) ? slide : null;

  return (
    <SlideView
      slide={slide}
      tally={slide.kind === 'choice' ? tallyChoices(slide, roster, participants, answers) : null}
      reveal={session.reveals[slide.id] ?? null}
    >
      {tally && (
        <>
          <p className="muted">{t.common.answeredCount(tally.answered, tally.expected)}</p>
          {admin && question && tally.expected > 0 && tally.waiting.length === 0 && <p className="muted">{t.session.allAnswered[question.scope]}</p>}
          {admin && onOpenPanel && tally.waiting.length > 0 && (
            <button type="button" className="chip chip--accent pearl-open" aria-controls={PEARL_PANEL_ID} onClick={onOpenPanel}>
              {t.pearlPanel.notAnsweredCount(tally.waiting.length)}
            </button>
          )}
        </>
      )}
      {slide.kind === 'text' && given.length > 0 && (
        <ul className="wall list-reset" aria-label={t.session.wallTitle}>
          {given.map((answer) => (
            <li key={answer.id} className="card wall__item">
              <strong>{subjectName(answer.subject, roster.students, roster.groups)}</strong>
              <span>{String(answer.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </SlideView>
  );
}
