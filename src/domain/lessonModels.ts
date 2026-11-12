import type { Id } from './models';

/** Lessons, their slides and the folders they sit in. Pure data, like `models.ts`, which re-exports all of it. */

export type SlideKind = 'content' | 'choice' | 'text' | 'media';

/** Who answers a question: every student, or one answer per group. */
export type AnswerScope = 'individual' | 'group';

interface SlideBase {
  id: Id;
  title: string;
  /** Short label shown above the title, e.g. the lesson phase. */
  tag: string;
}

export interface ContentSlide extends SlideBase {
  kind: 'content';
  /** Plain text. Lines starting with "- " render as bullets. */
  body: string;
  imageUrl: string;
}

export interface ChoiceSlide extends SlideBase {
  kind: 'choice';
  prompt: string;
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
