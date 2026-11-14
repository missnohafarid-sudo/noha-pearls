import type { ReactNode } from 'react';
import { isQuestion } from '../../domain/answering';
import type { AnswerKey, Slide } from '../../domain/models';
import { normalizeSlide } from '../../domain/lessonOps';
import { t } from '../../i18n';
import { DirectedText } from './DirectedText';
import { ScopeBadge } from './ScopeBadge';
import { slideUi } from './slideUi';
import './slides.css';

interface SlideViewProps {
  slide: Slide;
  /** The viewer's current answer. */
  answer?: number | string | null;
  /** The part of `answer` that is the viewer's group's, not her own. */
  groupAnswer?: number | string | null;
  /** Pass it to let the viewer answer; leave it out for a read-only slide. */
  onAnswer?: ((value: number | string) => void) | null;
  /** The published answer key, once revealed. */
  reveal?: AnswerKey | null;
  /** Answers per option, for the presenter. */
  tally?: number[] | null;
  /** Extra content under the slide body, e.g. the presenter's wall of text answers. */
  children?: ReactNode;
}

/** Draws any slide, for any audience. The same component serves the lesson page, the presenter and student devices. */
export function SlideView({ slide, answer = null, groupAnswer = null, onAnswer = null, reveal = null, tally = null, children }: SlideViewProps) {
  const { Body } = slideUi(slide.kind);
  const repaired = normalizeSlide(slide);
  return (
    <article className="slide">
      <header className="slide__head">
        {(slide.tag || isQuestion(slide)) && (
          <div className="slide__labels">
            {slide.tag && <span className="chip"><DirectedText text={slide.tag} /></span>}
            {isQuestion(slide) && <ScopeBadge scope={slide.scope} />}
          </div>
        )}
        <h2 className="slide__title">{slide.title ? <DirectedText text={slide.title} /> : t.slides.view.emptySlide}</h2>
      </header>
      {/* Keyed by slide: nothing typed on one slide may leak into the next. */}
      <Body key={slide.id} slide={repaired} interaction={{ answer, groupAnswer, onAnswer, reveal, tally }} />
      {children}
    </article>
  );
}
