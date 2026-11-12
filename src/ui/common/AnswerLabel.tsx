import { choiceLetter } from '../../i18n';
import type { Answer, QuestionSlide } from '../../domain/models';

/** An answer as words: "letter. option text" for a choice, the text itself otherwise. */
export function AnswerLabel({ slide, answer }: { slide: QuestionSlide; answer: Answer }) {
  if (slide.kind === 'choice' && typeof answer.value === 'number') {
    return <>{`${choiceLetter(answer.value)}. ${slide.options[answer.value] ?? ''}`}</>;
  }
  return <>{String(answer.value)}</>;
}
