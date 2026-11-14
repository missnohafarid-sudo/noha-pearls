import { useEffect, useState } from 'react';
import { MAX_TEXT_ANSWER_LENGTH } from '../../domain/answering';
import type { TextSlide } from '../../domain/models';
import { t } from '../../i18n';
import { DirectedText } from './DirectedText';
import { Pictures } from './Pictures';
import type { SlideBodyProps } from './slideUi';

/** A written question: its prompt, the viewer's box, and her group's answer when that is what counts for her. */
export function TextBody({ slide, interaction }: SlideBodyProps<TextSlide>) {
  const { onAnswer, answer, groupAnswer, reveal } = interaction;
  const covered = typeof groupAnswer === 'string' ? groupAnswer : '';
  const sent = covered === '' && typeof answer === 'string' ? answer : '';
  const [draft, setDraft] = useState(sent);

  // A group shares one answer: when a teammate sends theirs, every device of the group shows it. Her group's answer behind her own box never replaces her draft.
  useEffect(() => setDraft(sent), [sent]);

  return (
    <div className="slide-question">
      <p className="slide-question__prompt"><DirectedText text={slide.prompt} /></p>
      <Pictures links={slide.images} />
      {covered !== '' && (
        <div className="slide-answer slide-answer--group">
          <span className="muted">{t.common.yourGroupAnswer}</span>
          <p><DirectedText text={covered} /></p>
        </div>
      )}
      {onAnswer ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            onAnswer(draft);
          }}
        >
          <textarea
            className="input"
            rows={4}
            maxLength={MAX_TEXT_ANSWER_LENGTH}
            placeholder={slide.placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="row">
            <button type="submit" className="btn btn--primary" disabled={draft.trim() === '' || draft === sent}>
              {sent ? t.slides.view.update : t.slides.view.send}
            </button>
            {sent && <span className="muted">{t.slides.view.sent}</span>}
          </div>
        </form>
      ) : (
        sent && <p className="slide-answer"><DirectedText text={sent} /></p>
      )}
      {reveal && <p className="muted">{t.slides.view.locked}</p>}
    </div>
  );
}
