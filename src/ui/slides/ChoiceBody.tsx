import type { ChoiceSlide } from '../../domain/models';
import { hasPictureOption, optionView } from '../../domain/choices';
import { optionMark, verdictOf } from '../../domain/scoring';
import { choiceLetter, t } from '../../i18n';
import { DirectedText } from './DirectedText';
import { Pictures } from './Pictures';
import './choicePictures.css';
import type { SlideBodyProps } from './slideUi';

/** A choice question: its prompt and options, for whoever looks at it (answering, read-only, or with the presenter's tallies). */
export function ChoiceBody({ slide, interaction }: SlideBodyProps<ChoiceSlide>) {
  const { onAnswer, reveal, tally, answer, underOption } = interaction;
  const most = Math.max(1, ...(tally ?? []));
  const verdict = reveal && answer !== null ? verdictOf(reveal, answer) : 'recorded';
  return (
    <div className="slide-question">
      <p className="slide-question__prompt"><DirectedText text={slide.prompt} /></p>
      <Pictures links={slide.images} />
      <div className={`slide-options${hasPictureOption(slide.options) ? ' slide-options--pictures' : ''}`}>
        {slide.options.map((option, index) => (
          <div key={index} className="slide-option-slot" data-option={index}>
            <button
              type="button"
              className={`slide-option slide-option--${optionMark(reveal, index, answer)}`}
              disabled={!onAnswer}
              onClick={() => onAnswer?.(index)}
            >
              <span className="slide-option__letter">{choiceLetter(index)}</span>
              <OptionContent option={option} />
              {tally && (
                <span className="slide-option__tally">
                  <span className="bar">
                    <span className="bar__fill" style={{ inlineSize: `${(tally[index] / most) * 100}%` }} />
                  </span>
                  <b>{tally[index]}</b>
                </span>
              )}
            </button>
            {underOption?.(index)}
          </div>
        ))}
      </div>
      {(verdict === 'correct' || verdict === 'wrong') && <p className={`slide-verdict slide-verdict--${verdict}`}>{t.slides.view[verdict]}</p>}
      {reveal?.explanation && (
        <p className="slide-explanation">
          <DirectedText text={reveal.explanation} />
        </p>
      )}
    </div>
  );
}

function OptionContent({ option }: { option: string }) {
  const view = optionView(option);
  if (view.kind === 'picture') return <img className="slide-option__picture" src={view.src} alt="" referrerPolicy="no-referrer" />;
  return <span className="slide-option__text"><DirectedText text={view.text} /></span>;
}
