import { isRecord } from './argumentChecks';
import { newId } from './ids';
import type { Lesson, Slide } from './models';
import type { IssueCode, RawSlide } from './slideFile';
import { isSlideKind, slideKindSpec } from './slideKinds';

/**
 * The lesson file: the one format in which lessons enter and leave the platform.
 * A teacher gets it from an AI assistant (see the prompt builder in i18n) or from
 * "export", and uploads or pastes it. Slide-level rules live in `slideKinds`.
 */

export const LESSON_FORMAT = 'spectrum-lesson';
export const LESSON_FORMAT_VERSION = 1;

export interface ImportIssue {
  code: IssueCode;
  /** 1-based slide number, or null for a file-level problem. */
  slide: number | null;
  field: string | null;
}

export type ImportResult = { ok: true; lesson: Lesson } | { ok: false; issues: ImportIssue[] };

/** The file a lesson is kept in, and the kinds of file the import offers to read. */
export const LESSON_FILE = { extension: 'md', mimeType: 'text/markdown', accept: '.md,.json,.txt' } as const;

/**
 * The lesson as a file to keep or hand to an assistant: the lesson object in a fenced block and nothing else.
 * No free text sits beside it, because the reader takes the outermost braces and a brace in a title line would mislead it.
 */
export function lessonFileText(lesson: Lesson): string {
  return `\`\`\`json\n${exportLesson(lesson)}\n\`\`\`\n`;
}

export function exportLesson(lesson: Lesson): string {
  const file = {
    format: LESSON_FORMAT,
    version: LESSON_FORMAT_VERSION,
    title: lesson.title,
    subject: lesson.subject,
    grade: lesson.grade,
    slides: lesson.slides.map((slide) => slideKindSpec(slide.kind).toFile(slide)),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Chat assistants wrap JSON in prose and code fences, so take the outermost
 * object instead of demanding a clean file from a non-technical user.
 * `not-json`: no object found at all. `bad-json`: braces found but the text does not parse
 * (most often an unescaped quotation mark inside a text).
 */
function extractObject(text: string): { file: Record<string, unknown> } | { problem: 'not-json' | 'bad-json' } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { problem: 'not-json' };
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return isRecord(parsed) ? { file: parsed } : { problem: 'bad-json' };
  } catch {
    return { problem: 'bad-json' };
  }
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function importLesson(text: string, now = Date.now()): ImportResult {
  const extracted = extractObject(text);
  if ('problem' in extracted) return { ok: false, issues: [{ code: extracted.problem, slide: null, field: null }] };
  const { file } = extracted;

  const issues: ImportIssue[] = [];
  const fileIssue = (code: IssueCode, field: string | null) => issues.push({ code, slide: null, field });

  if (file.format !== LESSON_FORMAT) fileIssue('wrong-format', 'format');
  else if (file.version !== LESSON_FORMAT_VERSION) fileIssue('unsupported-version', 'version');

  const title = textOf(file.title);
  if (!title) fileIssue('missing-field', 'title');

  const rawSlides = Array.isArray(file.slides) ? file.slides : [];
  if (rawSlides.length === 0) fileIssue('no-slides', 'slides');

  const slides: Slide[] = [];
  rawSlides.forEach((raw: unknown, index: number) => {
    const report = (code: IssueCode, field: string | null) => issues.push({ code, slide: index + 1, field });
    if (!isRecord(raw) || !isSlideKind(raw.kind)) {
      report('unknown-kind', 'kind');
      return;
    }
    slides.push(slideKindSpec(raw.kind).fromFile(raw as RawSlide, newId(), report));
  });

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    lesson: {
      id: newId(),
      folderId: null,
      title,
      subject: textOf(file.subject),
      grade: textOf(file.grade),
      published: false,
      slides,
      updatedAt: now,
    },
  };
}
