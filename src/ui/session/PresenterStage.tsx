import { answersForSlide, tallyChoices } from '../../domain/analytics';
import { isQuestion, tallyAnswerers } from '../../domain/answering';
import type { Answer, Participant, Session, SessionRoster, Slide } from '../../domain/models';
import { subjectName } from '../../domain/roster';
import { t } from '../../i18n';
import { useAdmin } from '../hooks/data';
import { SlideView } from '../slides/SlideView';

interface Props {
  session: Session;
  slide: Slide | undefined;
  answers: readonly Answer[];
  roster: SessionRoster;
  participants: readonly Participant[];
}

/** The current slide, read-only, with live tallies and the wall of text answers. */
export function PresenterStage({ session, slide, answers, roster, participants }: Props) {
  const admin = useAdmin();
  if (!slide) return <p className="muted">{t.session.noSlide}</p>;
  const given = answersForSlide(answers, slide.id);
  const question = isQuestion(slide) ? slide : null;
  const tally = question && tallyAnswerers(question, roster, participants, answers);

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
          {admin && tally.waiting.length > 0 && (
            <details>
              <summary className="summary-row">
                {t.session.notAnswered}
                <span className="chip">{tally.waiting.length}</span>
              </summary>
              <ul className="list-reset stack stack--tight">
                {tally.waiting.map(({ id, name }) => (
                  <li key={id}>{name}</li>
                ))}
              </ul>
            </details>
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
