import { optionWords } from '../../domain/choices';
import { t } from '../../i18n';

/** An option as words wherever it is named in a sentence: its text, or the word for a picture. */
export function optionName(option: string): string {
  return optionWords(option) ?? t.common.pictureOption;
}
