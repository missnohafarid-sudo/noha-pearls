import type { Id } from './models';
import type { PearlShade } from './pearlShades';

/** Lessons, their slides and the folders they sit in. Pure data, like `models.ts`, which re-exports all of it. */

export type SlideKind = 'content' | 'choice' | 'text' | 'media';

/** Who answers a question: every student, or one answer per group. */
export type AnswerScope = 'individual' | 'group';

/** A small coloured label shown beside a slide's tag. */
export interface SlideBadge {
  text: string;
  color: PearlShade;
}

interface SlideBase {
  id: Id;
  title: string;
  /** Short label shown above the title, e.g. the lesson phase. */
  tag: string;
  /** Extra coloured badges drawn after the tag. */
  badges: SlideBadge[];
}

export interface ContentSlide extends SlideBase {
  kind: 'content';
  /** Plain text. Lines starting with "- " render as bullets. */
  body: string;
  /** Public https addresses of photos shown in a row; the site stores no files. */
  images: string[];
  /** Same plain text as `body`, opened by a button on the slide. Empty means none. */
  hidden: string;
}

export interface ChoiceSlide extends SlideBase {
  kind: 'choice';
  prompt: string;
  /** Public https addresses of photos shown between the prompt and the options. */
  images: string[];
  options: string[];
  /** `null` makes it a poll or prediction with no right answer. */
  correctIndex: number | null;
  explanation: string;
  scope: AnswerScope;
  points: number;
}

export interface TextSlide extends SlideBase {
  kind: 'text';
  prompt: string;
  placeholder: string;
  /** Public https addresses of photos shown between the prompt and the answer box. */
  images: string[];
  scope: AnswerScope;
  points: number;
}

/** What a media link holds. */
export type MediaType = 'audio' | 'image' | 'video' | 'pdf' | 'embed';

/** What a teacher may declare for a link: `auto` lets the link decide. */
export type MediaChoice = MediaType | 'auto';

export interface MediaSlide extends SlideBase {
  kind: 'media';
  /** A public https address; the site stores no media. */
  url: string;
  /** What the link holds. */
  media: MediaChoice;
  /** Same plain text as a content slide's body. */
  body: string;
}

export type Slide = ContentSlide | ChoiceSlide | TextSlide | MediaSlide;
export type QuestionSlide = ChoiceSlide | TextSlide;

/** A folder of lessons. Folders nest: `parentId` null is the top level. */
export interface LessonFolder {
  id: Id;
  name: string;
  parentId: Id | null;
  /** Position among its siblings; lower comes first. */
  order: number;
}

/** What a lesson card and the folder tree need of a lesson: no slides, so no answer key. */
export interface LessonSummary extends Pick<Lesson, 'id' | 'folderId' | 'title' | 'subject' | 'grade' | 'published' | 'updatedAt'> {
  slideCount: number;
  questionCount: number;
}

export interface Lesson {
  id: Id;
  /** The folder the lesson sits in; null is the top level. */
  folderId: Id | null;
  title: string;
  subject: string;
  grade: string;
  /** Unpublished lessons are visible to the admin only. */
  published: boolean;
  slides: Slide[];
  updatedAt: number;
}
