import type { StudentReport, StudentResult } from './analytics';
import type { Answer, Id, QuestionSlide } from './models';
import type { Verdict } from './scoring';

/** What a results line draws and nothing else of the question: its title, the answer as given, the verdict, whose answer it was. */

/** An answer as it is shown: the option chosen (with its place, for its letter) or the text written. */
export type ShownAnswer = { kind: 'choice'; index: number; option: string } | { kind: 'text'; text: string };

export function shownAnswer(slide: QuestionSlide, answer: Answer): ShownAnswer {
  if (slide.kind === 'choice' && typeof answer.value === 'number') return { kind: 'choice', index: answer.value, option: slide.options[answer.value] ?? '' };
  return { kind: 'text', text: String(answer.value) };
}

export interface ResultRow {
  slideId: Id;
  title: string;
  answer: ShownAnswer | null;
  verdict: Verdict | 'none';
  byGroup: boolean;
}

export interface ResultsReport {
  points: number;
  results: ResultRow[];
}

function resultRow({ slide, answer, verdict, byGroup }: StudentResult): ResultRow {
  return { slideId: slide.id, title: slide.title, answer: answer && shownAnswer(slide, answer), verdict, byGroup };
}

export function resultsReport({ points, results }: StudentReport): ResultsReport {
  return { points, results: results.map(resultRow) };
}
