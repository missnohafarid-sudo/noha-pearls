import sampleLesson from '../src/domain/sampleLesson.json';

/** The lesson the app seeds on first run, and the slide numbers (0-based) the walkthrough uses. */
export const SAMPLE = sampleLesson;

export const SLIDE = {
  opening: 0,
  poll: 2,
  firstQuestion: 5,
  groupText: 7,
  aiClaim: 8,
  closing: 11,
} as const;

/** A short stretch of a slide's text that is certain to be on screen when the slide is shown. */
export function slideText(index: number): string {
  const slide = SAMPLE.slides[index];
  const text = slide.prompt ?? slide.title;
  return text.split('\n')[0].trim();
}

export function optionsOf(index: number): string[] {
  return SAMPLE.slides[index].options ?? [];
}

/** 0-based index of the right option of a choice slide. */
export function correctIndexOf(index: number): number {
  return (SAMPLE.slides[index].correct ?? 0) - 1;
}

export function explanationOf(index: number): string {
  return (SAMPLE.slides[index].explanation ?? '').split('\n')[0].trim();
}
