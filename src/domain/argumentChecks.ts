import { isCardNumber } from './cards';
import { normalizeJoinCode } from './ids';
import { MAX_TEXT_ANSWER_LENGTH } from './answering';
import { PACING_MODES } from './pacing';
import { PERIOD_KINDS, periodAt, type Period } from './periods';

/** The single home of what an argument may look like before any service sees it: small checkers, built into the shape of each method's arguments. */

export type Check = (value: unknown) => boolean;

export const MAX_ID_LENGTH = 64;
export const MAX_NAME_LENGTH = 100;
export const MAX_SLIDE_INDEX = 1000;
export const MAX_LIST_LENGTH = 1000;
/** A title, a subject, a grade or a line of the site's text. */
export const MAX_TITLE_LENGTH = 2000;
export const MAX_SLIDES_PER_LESSON = 2000;
/** What a message to a group may hold before it is trimmed to `MAX_MESSAGE_LENGTH`. */
export const MAX_RAW_MESSAGE_LENGTH = 1000;
export const MAX_COLUMN_HEADER_LENGTH = 200;
export const MAX_MIN_INTERACTIONS = 1000;
export const MAX_HIDDEN_PART = 1000;
/** A class code is at most this long once spaces are removed and digits made Latin. */
const MAX_CODE_LENGTH = 12;
const MAX_RAW_CODE_LENGTH = 64;

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const text = (max: number): Check => (value) => typeof value === 'string' && value.length <= max;
export const nonEmptyText = (max: number): Check => (value) => typeof value === 'string' && value.length > 0 && value.length <= max;
export const integer = (min: number, max: number): Check => (value) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
export const number = (min: number, max: number): Check => (value) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export const oneOf = (...allowed: readonly unknown[]): Check => (value) => allowed.includes(value);
export const isBoolean: Check = (value) => typeof value === 'boolean';
export const nullable = (check: Check): Check => (value) => value === null || check(value);
/** A field added after records were already stored: old records do not have it. */
export const optional = (check: Check): Check => (value) => value === undefined || check(value);
export const listOf = (check: Check, max = MAX_LIST_LENGTH): Check => (value) => Array.isArray(value) && value.length <= max && value.every(check);

/** An object with only these fields, each accepting the value found there; a missing field is found as `undefined`, so it passes only through `optional(...)`. */
export const shape =
  (fields: Record<string, Check>): Check =>
  (value) =>
    isRecord(value) && Object.keys(value).every((key) => Object.hasOwn(fields, key)) && Object.entries(fields).every(([key, check]) => check(value[key]));

export const isId: Check = nonEmptyText(MAX_ID_LENGTH);
export const isName: Check = text(MAX_NAME_LENGTH);
export const slideIndex: Check = integer(0, MAX_SLIDE_INDEX);
export const hiddenPart: Check = integer(0, MAX_HIDDEN_PART);

/** What a student types for a class code: after `normalizeJoinCode` it must be letters and digits of a code's length. */
export const isClassCode: Check = (value) =>
  typeof value === 'string' && value.length <= MAX_RAW_CODE_LENGTH && /^[A-Z0-9]+$/.test(normalizeJoinCode(value)) && normalizeJoinCode(value).length <= MAX_CODE_LENGTH;

export const isCard: Check = (value) => typeof value === 'number' && Number.isInteger(value) && isCardNumber(value);
export const isPeriodKind: Check = oneOf(...PERIOD_KINDS);
export const isPacingMode: Check = oneOf(...PACING_MODES);

/** A period is one the calendar makes: the kind and start decide the end. */
export const isPeriod: Check = (value) => {
  if (!shape({ kind: isPeriodKind, start: number(0, 8.64e15), end: number(0, 8.64e15) })(value)) return false;
  const { kind, start, end } = value as Period;
  const made = periodAt(kind, start);
  return made.start === start && made.end === end;
};

/** The value of an answer: an option number, or the text a student typed, before it is cleaned and cut. */
export const isAnswerValue: Check = (value) => integer(0, 99)(value) || text(MAX_TEXT_ANSWER_LENGTH * 4)(value);
