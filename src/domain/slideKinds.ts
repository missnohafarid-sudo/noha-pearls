import { MAX_CHOICES, MIN_CHOICES } from './choices';
import { isHttpsUrl, isMediaChoice, isMediaProblem, mediaView, picturesHaveProblem } from './media';
import type { AnswerScope, ChoiceSlide, ContentSlide, MediaSlide, Slide, SlideKind, TextSlide } from './models';
import type { FileField, IssueReporter, RawSlide, SlideKindSpec } from './slideFile';

/**
 * Registry of slide kinds. Everything a kind needs outside the UI lives here:
 * its blank template and how it is read from and written to a lesson file.
 * A new kind is added here (and in the UI registry); no caller changes.
 */

function text(raw: RawSlide, field: string): string {
  const value = raw[field];
  return typeof value === 'string' ? value.trim() : '';
}

function requiredText(raw: RawSlide, field: string, report: IssueReporter): string {
  const value = text(raw, field);
  if (!value) report('missing-field', field);
  return value;
}

const trimmedLinks = (links: readonly string[]) => links.map((link) => link.trim()).filter((link) => link !== '');

const isAbsent = (value: unknown) => value === undefined || value === null;

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

/** A list of photo links from a file: the new `images`, or the one `imageUrl` that older files held. Entries are trimmed, blanks dropped, and every kept link must be https. */
function picturesOf(raw: RawSlide, report: IssueReporter): string[] {
  const modern = !isAbsent(raw.images);
  const field = modern ? 'images' : 'imageUrl';
  const listed = modern ? raw.images : [raw.imageUrl];
  if (!Array.isArray(listed) || !listed.every((link) => isAbsent(link) || typeof link === 'string')) {
    report('bad-images', field);
    return [];
  }
  const links = listed.flatMap((link: unknown) => (typeof link === 'string' && link.trim() !== '' ? [link.trim()] : []));
  if (!links.every(isHttpsUrl)) report('bad-url', field);
  return links;
}

/** Stored before pictures became a list: a content slide held one `imageUrl`, a text slide had no pictures. */
interface StoredPictures {
  images?: string[];
  imageUrl?: string;
}

function storedPictures({ images, imageUrl }: StoredPictures): string[] {
  return images ?? (imageUrl ? [imageUrl] : []);
}

const COMMON_FIELDS: readonly FileField[] = [
  { name: 'kind', required: true },
  { name: 'title', required: true },
  { name: 'tag', required: false },
];

const QUESTION_FIELDS: readonly FileField[] = [
  { name: 'prompt', required: true },
  { name: 'scope', required: false },
  { name: 'points', required: false },
];

const content: SlideKindSpec<ContentSlide> = {
  kind: 'content',
  create: (id) => ({ id, kind: 'content', title: '', tag: '', body: '', images: [] }),
  fileFields: [...COMMON_FIELDS, { name: 'body', required: false }, { name: 'images', required: false }],
  fromFile: (raw, id, report) => ({
    id,
    kind: 'content',
    title: requiredText(raw, 'title', report),
    tag: text(raw, 'tag'),
    body: text(raw, 'body'),
    images: picturesOf(raw, report),
  }),
  toFile: ({ kind, title, tag, body, images }) => ({ kind, title, tag, body, images: trimmedLinks(images) }),
  normalize: ({ imageUrl, ...slide }: ContentSlide & StoredPictures) => ({ ...slide, images: storedPictures({ images: slide.images, imageUrl }) }),
  hasProblem: ({ images }) => picturesHaveProblem(images),
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
    id,
    kind: 'choice',
    title: '',
    tag: '',
    prompt: '',
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
  ],
  fromFile: (raw, id, report) => {
    const options = optionsOf(raw, report);
    return {
      id,
      kind: 'choice',
      title: requiredText(raw, 'title', report),
      tag: text(raw, 'tag'),
      prompt: requiredText(raw, 'prompt', report),
      options,
      correctIndex: correctIndexOf(raw, options.length, report),
      explanation: text(raw, 'explanation'),
      scope: scopeOf(raw, 'individual', report),
      points: pointsOf(raw, report),
    };
  },
  toFile: ({ kind, title, tag, prompt, options, correctIndex, explanation, scope, points }) => ({
    kind,
    title,
    tag,
    prompt,
    options,
    correct: correctIndex === null ? null : correctIndex + 1,
    explanation,
    scope,
    points,
  }),
  // Removing an option must not leave the correct answer pointing past the end.
  normalize: (slide) => ({
    ...slide,
    points: clampPoints(slide.points),
    correctIndex: slide.correctIndex !== null && slide.correctIndex >= slide.options.length ? null : slide.correctIndex,
  }),
};

const textKind: SlideKindSpec<TextSlide> = {
  kind: 'text',
  create: (id) => ({ id, kind: 'text', title: '', tag: '', prompt: '', placeholder: '', images: [], scope: 'group', points: 1 }),
  fileFields: [...COMMON_FIELDS, ...QUESTION_FIELDS, { name: 'placeholder', required: false }, { name: 'images', required: false }],
  fromFile: (raw, id, report) => ({
    id,
    kind: 'text',
    title: requiredText(raw, 'title', report),
    tag: text(raw, 'tag'),
    prompt: requiredText(raw, 'prompt', report),
    placeholder: text(raw, 'placeholder'),
    images: picturesOf(raw, report),
    scope: scopeOf(raw, 'group', report),
    points: pointsOf(raw, report),
  }),
  toFile: ({ kind, title, tag, prompt, placeholder, images, scope, points }) => ({ kind, title, tag, prompt, placeholder, images: trimmedLinks(images), scope, points }),
  normalize: (slide) => ({ ...slide, images: storedPictures(slide), points: clampPoints(slide.points) }),
  hasProblem: ({ images }) => picturesHaveProblem(images),
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
  create: (id) => ({ id, kind: 'media', title: '', tag: '', url: '', media: 'auto', body: '' }),
  fileFields: [...COMMON_FIELDS, { name: 'url', required: false }, { name: 'media', required: false }, { name: 'body', required: false }],
  fromFile: (raw, id, report) => ({
    id,
    kind: 'media',
    title: requiredText(raw, 'title', report),
    tag: text(raw, 'tag'),
    url: urlOf(raw, report),
    media: mediaOf(raw, report),
    body: text(raw, 'body'),
  }),
  toFile: ({ kind, title, tag, url, media: type, body }) => ({ kind, title, tag, url, media: type, body }),
  hasProblem: ({ url, media: type }) => isMediaProblem(mediaView(url, type)),
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
