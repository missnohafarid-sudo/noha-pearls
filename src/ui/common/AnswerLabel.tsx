import { choiceLetter } from '../../i18n';
import type { ShownAnswer } from '../../domain/resultRows';

/** An answer as words: "letter. option text" for a choice, the text itself otherwise. */
export function AnswerLabel({ answer }: { answer: ShownAnswer }) {
  return <>{answer.kind === 'choice' ? `${choiceLetter(answer.index)}. ${answer.option}` : answer.text}</>;
}
