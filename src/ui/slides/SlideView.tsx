import type { ReactNode } from 'react';
import { keptBadges } from '../../domain/badges';
import { isQuestion } from '../../domain/answering';
import type { AnswerKey, Slide } from '../../domain/models';
import { normalizeSlide } from '../../domain/lessonOps';
import { t } from '../../i18n';
import { DirectedText } from './DirectedText';
import { HiddenControlProvider, type HiddenControl } from './hiddenControl';
import { ScopeBadge } from './ScopeBadge';
import { slideUi } from './slideUi';
import './badges.css';
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
  /** Names drawn under each option of a choice question; `null` everywhere but a shared device's individual question. */
  underOption?: ((index: number) => ReactNode) | null;
  /** Who opens the slide's hidden parts; `null`: each keeps its own state and button. */
  hiddenControl?: HiddenControl | null;
  /** Extra content under the slide body, e.g. the presenter's wall of text answers. */
  children?: ReactNode;
}

/** Draws any slide, for any audience. The same component serves the lesson page, the presenter and student devices. */
export function SlideView({ slide, answer = null, groupAnswer = null, onAnswer = null, reveal = null, tally = null, underOption = null, hiddenControl = null, children }: SlideViewProps) {
  const { Body } = slideUi(slide.kind);
  const repaired = normalizeSlide(slide);
  const badges = keptBadges(repaired.badges);
  return (
    <article className="slide">
      <header className="slide__head">
        {(repaired.tag || badges.length > 0 || isQuestion(repaired)) && (
          <div className="slide__labels">
            {repaired.tag && <span className="chip"><span><DirectedText text={repaired.tag} /></span></span>}
            {badges.map((badge, index) => (
              <span key={index} className={`slide-badge slide-badge--${badge.color}`}><span><DirectedText text={badge.text} /></span></span>
            ))}
            {isQuestion(repaired) && <ScopeBadge scope={repaired.scope} />}
          </div>
        )}
        <h2 className="slide__title">{slide.title ? <DirectedText text={slide.title} /> : t.slides.view.emptySlide}</h2>
      </header>
      {/* Keyed by slide: nothing typed on one slide may leak into the next. */}
      <HiddenControlProvider value={hiddenControl}>
        <Body key={slide.id} slide={repaired} interaction={{ answer, groupAnswer, onAnswer, reveal, tally, underOption }} />
      </HiddenControlProvider>
      {children}
    </article>
  );
}
