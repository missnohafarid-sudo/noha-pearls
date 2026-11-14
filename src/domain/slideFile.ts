import type { Id, Slide } from './models';

/** The vocabulary of a slide in a lesson file: what a kind must provide, the fields it may hold and the problems a file can have. */

export type RawSlide = Record<string, unknown>;

export type IssueCode =
  | 'not-json'
  | 'bad-json'
  | 'wrong-format'
  | 'unsupported-version'
  | 'no-slides'
  | 'unknown-kind'
  | 'missing-field'
  | 'bad-options'
  | 'bad-correct'
  | 'bad-scope'
  | 'bad-points'
  | 'bad-url'
  | 'bad-media'
  | 'bad-images'
  | 'bad-badges';

export type IssueReporter = (code: IssueCode, field: string | null) => void;

/** Every field name a lesson file may hold, so the text module can be made to describe each one. */
export type FileFieldName =
  | 'kind'
  | 'title'
  | 'tag'
  | 'badges'
  | 'body'
  | 'images'
  | 'hidden'
  | 'prompt'
  | 'scope'
  | 'points'
  | 'options'
  | 'correct'
  | 'explanation'
  | 'placeholder'
  | 'url'
  | 'media';

/** One field of a slide as it appears in a lesson file. Drives validation docs and the AI prompt. */
export interface FileField {
  name: FileFieldName;
  required: boolean;
}

export interface SlideKindSpec<S extends Slide = Slide> {
  kind: S['kind'];
  create(id: Id): S;
  fileFields: readonly FileField[];
  fromFile(raw: RawSlide, id: Id, report: IssueReporter): S;
  toFile(slide: S): RawSlide;
  /** Repairs fields that an edit left inconsistent. Omitted when a kind has no such fields. */
  normalize?(slide: S): S;
  /** True when the slide cannot show what it should, so the editor can mark it. Omitted when a kind cannot be in that state. */
  hasProblem?(slide: S): boolean;
  /** The copy a reader who may not know the answer gets: whatever a reveal publishes is removed. The identity for a kind with no key. */
  withoutKey(slide: S): S;
  /** How many hidden parts the slide's text holds, counted in reading order. Omitted when a kind has no hidden parts. */
  hiddenPartCount?(slide: S): number;
  /** The copy with every hidden part cut out except those at the given positions (see `hiddenPartCount`). Omitted when a kind has no hidden parts. */
  withOpenedParts?(slide: S, opened: readonly number[]): S;
}
