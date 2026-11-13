import type { AnswerMark } from '../../../domain/answering';
import { t } from '../../../i18n';

/** Whether a group or student has answered: two looks, filled and green, or hollow and quiet. */
export function AnswerMarkChip({ mark }: { mark: AnswerMark }) {
  return <span className={`chip pearl-mark pearl-mark--${mark}`}>{mark === 'answered' ? t.pearlPanel.answered : t.session.notAnswered}</span>;
}
