import type { ComponentType, ReactNode } from 'react';
import { MAX_CHOICES, MIN_CHOICES, removeOption } from '../../domain/choices';
import type { AnswerKey, ContentSlide, Slide, SlideKind } from '../../domain/models';
import { choiceLetter, t } from '../../i18n';
import { MAX_POINTS, MIN_POINTS } from '../../domain/slideKinds';
import { MAX_PICTURES, MEDIA_CHOICES } from '../../domain/media';
import type { FieldSpec, SelectOption } from '../forms/SchemaForm';
import { BadgesField } from './BadgesField';
import { BodyText } from './BodyText';
import { ChoiceBody } from './ChoiceBody';
import { HiddenSection } from './HiddenSection';
import { MediaBody } from './MediaBody';
import { Pictures } from './Pictures';
import { TextBody } from './TextBody';

/**
 * The UI half of the slide-kind registry: for each kind, its editing fields and
 * how its body is drawn. `domain/slideKinds` holds the non-visual half.
 * Adding a kind means adding an entry here; `SlideView` and the editor pick it up.
 */

/** How the viewer may interact with a slide and what they are allowed to see. */
export interface SlideInteraction {
  /** The viewer's current answer, if any. */
  answer: number | string | null;
  /** The answer that counts for the viewer only because her group gave it; a written answer shows it apart from her own box. */
  groupAnswer: number | string | null;
  /** Present when the viewer may answer; absent on the presenter and in previews. */
  onAnswer: ((value: number | string) => void) | null;
  /** The published answer key, once the teacher reveals it. */
  reveal: AnswerKey | null;
  /** Answers per option, for the presenter's live bars. */
  tally: number[] | null;
  /** What a choice question draws under an option's button (a shared device's names for that option), and makes the option a drop target. */
  underOption: ((index: number) => ReactNode) | null;
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
      {slide.hidden.trim() !== '' && (
        <HiddenSection>
          <BodyText text={slide.hidden} />
        </HiddenSection>
      )}
    </div>
  );
}

const COMMON_FIELDS = [
  { kind: 'text', key: 'title', label: f.title },
  { kind: 'text', key: 'tag', label: f.tag },
  { kind: 'custom', key: 'badges', label: f.badges, hint: f.badgesHint, render: (slide: Slide, onChange: (value: unknown) => void) => <BadgesField badges={slide.badges} onChange={onChange} /> },
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
      { kind: 'textarea', key: 'body', label: f.body, hint: f.bodyHint, slideText: true },
      PICTURES_FIELD,
      { kind: 'textarea', key: 'hidden', label: f.hidden, hint: f.hiddenHint, slideText: true },
    ],
    Body: ContentBody,
  },
  choice: {
    label: t.slides.kind.choice,
    fields: [
      ...COMMON_FIELDS,
      { kind: 'textarea', key: 'prompt', label: f.prompt },
      PICTURES_FIELD,
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
      { kind: 'textarea', key: 'body', label: f.body, hint: f.bodyHint, slideText: true },
    ],
    Body: MediaBody,
  },
};

/** The registry entry for a kind, for callers that hold a slide of unknown kind. */
export function slideUi(kind: SlideKind): SlideUi<Slide> {
  return SLIDE_UI[kind] as unknown as SlideUi<Slide>;
}
