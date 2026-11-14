import { isPictureLink, pictureSources } from './media';
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

/** What an option is: words, or a picture by itself (its link pasted alone) with the address to draw. */
export type OptionView = { kind: 'words'; text: string } | { kind: 'picture'; src: string };

export function optionView(option: string): OptionView {
  const [src] = isPictureLink(option) ? pictureSources([option.trim()]) : [];
  return src ? { kind: 'picture', src } : { kind: 'words', text: option };
}

/** Whether any option is a picture: the options are then laid out as a grid. */
export function hasPictureOption(options: readonly string[]): boolean {
  return options.some((option) => optionView(option).kind === 'picture');
}

/** The words that name an option in a sentence: its text, or nothing for a picture. */
export function optionWords(option: string): string | null {
  const view = optionView(option);
  return view.kind === 'words' ? view.text : null;
}
