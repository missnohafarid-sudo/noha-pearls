import type { ChoiceSlide } from '../../domain/models';
import { optionMark, verdictOf } from '../../domain/scoring';
import { choiceLetter, t } from '../../i18n';
import { DirectedText } from './DirectedText';
import type { SlideBodyProps } from './slideUi';

/** A choice question: its prompt and options, for whoever looks at it (answering, read-only, or with the presenter's tallies). */
export function ChoiceBody({ slide, interaction }: SlideBodyProps<ChoiceSlide>) {
  const { onAnswer, reveal, tally, answer } = interaction;
  const most = Math.max(1, ...(tally ?? []));
  const verdict = reveal && answer !== null ? verdictOf(reveal, answer) : 'recorded';
  return (
    <div className="slide-question">
      <p className="slide-question__prompt"><DirectedText text={slide.prompt} /></p>
      <div className="slide-options">
        {slide.options.map((option, index) => (
          <button
            key={index}
            type="button"
            className={`slide-option slide-option--${optionMark(reveal, index, answer)}`}
            disabled={!onAnswer}
            onClick={() => onAnswer?.(index)}
          >
            <span className="slide-option__letter">{choiceLetter(index)}</span>
            <span className="slide-option__text"><DirectedText text={option} /></span>
            {tally && (
              <span className="slide-option__tally">
                <span className="bar">
                  <span className="bar__fill" style={{ inlineSize: `${(tally[index] / most) * 100}%` }} />
                </span>
                <b>{tally[index]}</b>
              </span>
            )}
          </button>
        ))}
      </div>
      {(verdict === 'correct' || verdict === 'wrong') && <p className={`slide-verdict slide-verdict--${verdict}`}>{t.slides.view[verdict]}</p>}
      {reveal?.explanation && <p className="slide-explanation">{reveal.explanation}</p>}
    </div>
  );
}
