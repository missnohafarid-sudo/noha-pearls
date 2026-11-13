import { useEffect, useState, type ComponentType } from 'react';
import { MAX_TEXT_ANSWER_LENGTH } from '../../domain/answering';
import { MAX_CHOICES, MIN_CHOICES, removeOption } from '../../domain/choices';
import type { AnswerKey, ChoiceSlide, ContentSlide, Slide, SlideKind, TextSlide } from '../../domain/models';
import { choiceLetter, t } from '../../i18n';
import { MAX_POINTS, MIN_POINTS } from '../../domain/slideKinds';
import { optionMark, verdictOf } from '../../domain/scoring';
import { MAX_PICTURES, MEDIA_CHOICES } from '../../domain/media';
import type { FieldSpec, SelectOption } from '../forms/SchemaForm';
import { BodyText } from './BodyText';
import { MediaBody } from './MediaBody';
import { Pictures } from './Pictures';

/**
 * The UI half of the slide-kind registry: for each kind, its editing fields and
 * how its body is drawn. `domain/slideKinds` holds the non-visual half.
 * Adding a kind means adding an entry here; `SlideView` and the editor pick it up.
 */

/** How the viewer may interact with a slide and what they are allowed to see. */
export interface SlideInteraction {
  /** The viewer's current answer, if any. */
  answer: number | string | null;
  /** Present when the viewer may answer; absent on the presenter and in previews. */
  onAnswer: ((value: number | string) => void) | null;
  /** The published answer key, once the teacher reveals it. */
  reveal: AnswerKey | null;
  /** Answers per option, for the presenter's live bars. */
  tally: number[] | null;
}

export interface SlideBodyProps<S extends Slide> {
  slide: S;
  interaction: SlideInteraction;
}

interface SlideUi<S extends Slide> {
  label: string;
  fields: readonly FieldSpec<S>[];
  Body: ComponentType<SlideBodyProps<S>>;
}

const f = t.slides.field;

const SCOPE_OPTIONS: SelectOption[] = [
  { value: 'individual', label: t.common.scope.individual },
  { value: 'group', label: t.common.scope.group },
];

const MEDIA_OPTIONS: SelectOption[] = MEDIA_CHOICES.map((value) => ({ value, label: t.slides.mediaType[value] }));

function ContentBody({ slide }: SlideBodyProps<ContentSlide>) {
  return (
    <div className="slide-content">
      <BodyText text={slide.body} />
      <Pictures links={slide.images} />
    </div>
  );
}

function ChoiceBody({ slide, interaction }: SlideBodyProps<ChoiceSlide>) {
  const { onAnswer, reveal, tally, answer } = interaction;
  const most = Math.max(1, ...(tally ?? []));
  const verdict = reveal && answer !== null ? verdictOf(reveal, answer) : 'recorded';
  return (
    <div className="slide-question">
      <p className="slide-question__prompt">{slide.prompt}</p>
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
            <span className="slide-option__text">{option}</span>
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

function TextBody({ slide, interaction }: SlideBodyProps<TextSlide>) {
  const { onAnswer, answer, reveal } = interaction;
  const sent = typeof answer === 'string' ? answer : '';
  const [draft, setDraft] = useState(sent);

  // A group shares one answer: when a teammate sends theirs, every device of the group shows it.
  useEffect(() => setDraft(sent), [sent]);

  return (
    <div className="slide-question">
      <p className="slide-question__prompt">{slide.prompt}</p>
      <Pictures links={slide.images} />
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
        sent && <p className="slide-answer">{sent}</p>
      )}
      {reveal && <p className="muted">{t.slides.view.locked}</p>}
    </div>
  );
}

const COMMON_FIELDS = [
  { kind: 'text', key: 'title', label: f.title },
  { kind: 'text', key: 'tag', label: f.tag },
] as const;

const PICTURES_FIELD = {
  kind: 'list',
  key: 'images',
  label: f.images,
  hint: f.imagesHint,
  min: 0,
  max: MAX_PICTURES,
  itemLabel: (index: number) => f.image(index + 1),
  ltr: true,
} as const;

const QUESTION_TAIL = [
  { kind: 'select', key: 'scope', label: f.scope, options: () => SCOPE_OPTIONS },
  { kind: 'number', key: 'points', label: f.points, min: MIN_POINTS, max: MAX_POINTS },
] as const;

const SLIDE_UI: { [K in SlideKind]: SlideUi<Extract<Slide, { kind: K }>> } = {
  content: {
    label: t.slides.kind.content,
    fields: [
      ...COMMON_FIELDS,
      { kind: 'textarea', key: 'body', label: f.body, hint: f.bodyHint },
      PICTURES_FIELD,
    ],
    Body: ContentBody,
  },
  choice: {
    label: t.slides.kind.choice,
    fields: [
      ...COMMON_FIELDS,
      { kind: 'textarea', key: 'prompt', label: f.prompt },
      {
        kind: 'list',
        key: 'options',
        label: f.options,
        min: MIN_CHOICES,
        max: MAX_CHOICES,
        removeItem: removeOption,
        itemLabel: (index) => f.option(choiceLetter(index)),
      },
      {
        kind: 'select',
        key: 'correctIndex',
        label: f.correct,
        options: (slide) => [
          { value: null, label: f.noCorrect },
          ...slide.options.map((option, index) => ({ value: index, label: `${choiceLetter(index)} · ${option}` })),
        ],
      },
      { kind: 'textarea', key: 'explanation', label: f.explanation },
      ...QUESTION_TAIL,
    ],
    Body: ChoiceBody,
  },
  text: {
    label: t.slides.kind.text,
    fields: [
      ...COMMON_FIELDS,
      { kind: 'textarea', key: 'prompt', label: f.prompt },
      { kind: 'text', key: 'placeholder', label: f.placeholder },
      PICTURES_FIELD,
      ...QUESTION_TAIL,
    ],
    Body: TextBody,
  },
  media: {
    label: t.slides.kind.media,
    fields: [
      ...COMMON_FIELDS,
      { kind: 'text', key: 'url', label: f.url, hint: f.urlHint, ltr: true },
      { kind: 'select', key: 'media', label: f.media, options: () => MEDIA_OPTIONS },
      { kind: 'textarea', key: 'body', label: f.body, hint: f.bodyHint },
    ],
    Body: MediaBody,
  },
};

/** The registry entry for a kind, for callers that hold a slide of unknown kind. */
export function slideUi(kind: SlideKind): SlideUi<Slide> {
  return SLIDE_UI[kind] as unknown as SlideUi<Slide>;
}
