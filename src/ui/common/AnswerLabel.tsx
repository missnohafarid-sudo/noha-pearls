import { choiceLetter } from '../../i18n';
import type { ShownAnswer } from '../../domain/resultRows';
import { optionName } from './optionName';

/** An answer as words: "letter. option text" for a choice, the text itself otherwise. */
export function AnswerLabel({ answer }: { answer: ShownAnswer }) {
  return <>{answer.kind === 'choice' ? `${choiceLetter(answer.index)}. ${optionName(answer.option)}` : answer.text}</>;
}
