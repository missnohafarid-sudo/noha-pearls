import { badgesOf, keptBadges } from './badges';
import { MAX_CHOICES, MIN_CHOICES } from './choices';
import { isHttpsUrl, isMediaChoice, isMediaProblem, mediaView, picturesHaveProblem } from './media';
import type { AnswerScope, ChoiceSlide, ContentSlide, Id, MediaSlide, Slide, SlideKind, TextSlide } from './models';
import type { FileField, IssueReporter, RawSlide, SlideKindSpec } from './slideFile';
import { contentHiddenParts, mediaHiddenParts } from './slideHiddenParts';
import { isAbsent, picturesOf, requiredText, storedPictures, text, trimmedLinks, type StoredPictures } from './slideFields';

/**
 * Registry of slide kinds. Everything a kind needs outside the UI lives here:
 * its blank template and how it is read from and written to a lesson file.
 * A new kind is added here (and in the UI registry); no caller changes.
 */

/** Absent: the kind's default. Present: exactly `individual` or `group`. */
function scopeOf(raw: RawSlide, fallback: AnswerScope, report: IssueReporter): AnswerScope {
  if (isAbsent(raw.scope)) return fallback;
  if (raw.scope === 'individual' || raw.scope === 'group') return raw.scope;
  report('bad-scope', 'scope');
  return fallback;
}

export const MIN_POINTS = 0;
export const MAX_POINTS = 20;
const DEFAULT_POINTS = 1;

/** Points are whole numbers within the limits, whatever a form supplies (the editor clamps). */
function clampPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_POINTS;
  return Math.max(MIN_POINTS, Math.min(MAX_POINTS, Math.round(value)));
}

/** A file must give a whole number within the limits, or nothing; it is never repaired silently. */
function pointsOf(raw: RawSlide, report: IssueReporter): number {
  const value = raw.points;
  if (isAbsent(value)) return DEFAULT_POINTS;
  if (typeof value === 'number' && Number.isInteger(value) && value >= MIN_POINTS && value <= MAX_POINTS) return value;
  report('bad-points', 'points');
  return DEFAULT_POINTS;
}

/** The fields every slide shares: blank, read from a file, and written to one (kind, then title, then tag). */
function blankShared<K extends SlideKind>(id: Id, kind: K) {
  return { id, kind, title: '', tag: '', badges: [] };
}

function sharedFromFile<K extends SlideKind>(raw: RawSlide, id: Id, kind: K, report: IssueReporter) {
  return { id, kind, title: requiredText(raw, 'title', report), tag: text(raw, 'tag'), badges: badgesOf(raw, report) };
}

function sharedToFile({ kind, title, tag, badges }: Slide): RawSlide {
  return { kind, title, tag, badges: keptBadges(badges) };
}

const COMMON_FIELDS: readonly FileField[] = [
  { name: 'kind', required: true },
  { name: 'title', required: true },
  { name: 'tag', required: false },
  { name: 'badges', required: false },
];

const QUESTION_FIELDS: readonly FileField[] = [
  { name: 'prompt', required: true },
  { name: 'scope', required: false },
  { name: 'points', required: false },
];

/** A content slide as older data holds it: before pictures were a list and before the hidden section. */
type StoredContent = Omit<ContentSlide, 'images' | 'hidden'> & StoredPictures & { hidden?: string };

const content: SlideKindSpec<ContentSlide> = {
  kind: 'content',
  create: (id) => ({ ...blankShared(id, 'content'), body: '', images: [], hidden: '' }),
  fileFields: [...COMMON_FIELDS, { name: 'body', required: false }, { name: 'images', required: false }, { name: 'hidden', required: false }],
  fromFile: (raw, id, report) => ({
    ...sharedFromFile(raw, id, 'content', report),
    body: text(raw, 'body'),
    images: picturesOf(raw, report),
    hidden: text(raw, 'hidden'),
  }),
  toFile: (slide) => ({ ...sharedToFile(slide), body: slide.body, images: trimmedLinks(slide.images), hidden: slide.hidden }),
  normalize: ({ imageUrl, ...slide }: StoredContent) => ({ ...slide, images: storedPictures({ images: slide.images, imageUrl }), hidden: slide.hidden ?? '' }),
  hasProblem: ({ images }) => picturesHaveProblem(images),
  withoutKey: (slide) => slide,
  ...contentHiddenParts,
};

/** In files the correct option is 1-based (or null for a poll); in memory it is a 0-based index. */
function correctIndexOf(raw: RawSlide, optionCount: number, report: IssueReporter): number | null {
  const value = raw.correct;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= optionCount) return value - 1;
  report('bad-correct', 'correct');
  return null;
}

/** Every option must be a non-empty string or a finite number (maths answers); nothing is filtered out. */
function optionsOf(raw: RawSlide, report: IssueReporter): string[] {
  const value = Array.isArray(raw.options) ? raw.options : [];
  const options = value.map((o: unknown) => (typeof o === 'number' && Number.isFinite(o) ? String(o) : o));
  const valid = options.every((o): o is string => typeof o === 'string' && o.trim() !== '');
  if (!valid || options.length < MIN_CHOICES || options.length > MAX_CHOICES) report('bad-options', 'options');
  return options.map((o) => (typeof o === 'string' ? o.trim() : ''));
}

const choice: SlideKindSpec<ChoiceSlide> = {
  kind: 'choice',
  create: (id) => ({
    ...blankShared(id, 'choice'),
    prompt: '',
    images: [],
    options: ['', ''],
    correctIndex: null,
    explanation: '',
    scope: 'individual',
    points: 1,
  }),
  fileFields: [
    ...COMMON_FIELDS,
    ...QUESTION_FIELDS,
    { name: 'options', required: true },
    { name: 'correct', required: false },
    { name: 'explanation', required: false },
    { name: 'images', required: false },
  ],
  fromFile: (raw, id, report) => {
    const options = optionsOf(raw, report);
    return {
      ...sharedFromFile(raw, id, 'choice', report),
      prompt: requiredText(raw, 'prompt', report),
      images: picturesOf(raw, report),
      options,
      correctIndex: correctIndexOf(raw, options.length, report),
      explanation: text(raw, 'explanation'),
      scope: scopeOf(raw, 'individual', report),
      points: pointsOf(raw, report),
    };
  },
  toFile: (slide) => ({
    ...sharedToFile(slide),
    prompt: slide.prompt,
    images: trimmedLinks(slide.images),
    options: slide.options,
    correct: slide.correctIndex === null ? null : slide.correctIndex + 1,
    explanation: slide.explanation,
    scope: slide.scope,
    points: slide.points,
  }),
  // Removing an option must not leave the correct answer pointing past the end.
  normalize: (slide) => ({
    ...slide,
    images: storedPictures(slide),
    points: clampPoints(slide.points),
    correctIndex: slide.correctIndex !== null && slide.correctIndex >= slide.options.length ? null : slide.correctIndex,
  }),
  hasProblem: ({ images }) => picturesHaveProblem(images),
  withoutKey: (slide) => ({ ...slide, correctIndex: null, explanation: '' }),
};

const textKind: SlideKindSpec<TextSlide> = {
  kind: 'text',
  create: (id) => ({ ...blankShared(id, 'text'), prompt: '', placeholder: '', images: [], scope: 'group', points: 1 }),
  fileFields: [...COMMON_FIELDS, ...QUESTION_FIELDS, { name: 'placeholder', required: false }, { name: 'images', required: false }],
  fromFile: (raw, id, report) => ({
    ...sharedFromFile(raw, id, 'text', report),
    prompt: requiredText(raw, 'prompt', report),
    placeholder: text(raw, 'placeholder'),
    images: picturesOf(raw, report),
    scope: scopeOf(raw, 'group', report),
    points: pointsOf(raw, report),
  }),
  toFile: (slide) => ({
    ...sharedToFile(slide),
    prompt: slide.prompt,
    placeholder: slide.placeholder,
    images: trimmedLinks(slide.images),
    scope: slide.scope,
    points: slide.points,
  }),
  normalize: (slide) => ({ ...slide, images: storedPictures(slide), points: clampPoints(slide.points) }),
  hasProblem: ({ images }) => picturesHaveProblem(images),
  withoutKey: (slide) => slide,
};

/** A file may leave the address empty (the slide is then flagged, as the editor allows); a given one must be https. */
function urlOf(raw: RawSlide, report: IssueReporter): string {
  const value = text(raw, 'url');
  if (value && !isHttpsUrl(value)) report('bad-url', 'url');
  return value;
}

function mediaOf(raw: RawSlide, report: IssueReporter): MediaSlide['media'] {
  if (isAbsent(raw.media)) return 'auto';
  if (isMediaChoice(raw.media)) return raw.media;
  report('bad-media', 'media');
  return 'auto';
}

const media: SlideKindSpec<MediaSlide> = {
  kind: 'media',
  create: (id) => ({ ...blankShared(id, 'media'), url: '', media: 'auto', body: '' }),
  fileFields: [...COMMON_FIELDS, { name: 'url', required: false }, { name: 'media', required: false }, { name: 'body', required: false }],
  fromFile: (raw, id, report) => ({
    ...sharedFromFile(raw, id, 'media', report),
    url: urlOf(raw, report),
    media: mediaOf(raw, report),
    body: text(raw, 'body'),
  }),
  toFile: (slide) => ({ ...sharedToFile(slide), url: slide.url, media: slide.media, body: slide.body }),
  hasProblem: ({ url, media: type }) => isMediaProblem(mediaView(url, type)),
  withoutKey: (slide) => slide,
  ...mediaHiddenParts,
};

const SLIDE_KINDS: { [K in SlideKind]: SlideKindSpec<Extract<Slide, { kind: K }>> } = {
  content,
  choice,
  text: textKind,
  media,
};

export const SLIDE_KIND_NAMES = Object.keys(SLIDE_KINDS) as SlideKind[];

export function isSlideKind(value: unknown): value is SlideKind {
  return typeof value === 'string' && value in SLIDE_KINDS;
}

/** The registry entry for a kind, for callers that hold a slide of unknown kind. */
export function slideKindSpec(kind: SlideKind): SlideKindSpec {
  return SLIDE_KINDS[kind] as unknown as SlideKindSpec;
}

/** The keys of a slide's hidden parts, none for a kind without any. */
export function slideHiddenPartKeys(slide: Slide): string[] {
  return slideKindSpec(slide.kind).hiddenPartKeys?.(slide) ?? [];
}

/** The slide with only the hidden parts whose key is in `opened` left in; a kind without hidden parts is returned as it is. */
export function withOpenedParts(slide: Slide, opened: readonly string[]): Slide {
  return slideKindSpec(slide.kind).withOpenedParts?.(slide, opened) ?? slide;
}
