import type { ChoiceSlide } from './models';

/** The single home for multiple-choice limits. */
export const MIN_CHOICES = 2;
/** Four is a hard limit: an answer card has four edges, one per option. */
export const MAX_CHOICES = 4;

/** Removes an option and keeps the correct answer on the same option; removing the correct one clears it. */
export function removeOption(slide: ChoiceSlide, index: number): ChoiceSlide {
  const { correctIndex } = slide;
  const kept = correctIndex === null || correctIndex === index ? null : correctIndex > index ? correctIndex - 1 : correctIndex;
  return { ...slide, options: slide.options.filter((_, i) => i !== index), correctIndex: kept };
}
