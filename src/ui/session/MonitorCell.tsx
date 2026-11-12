import type { MonitorCell as Cell } from '../../domain/analytics';
import { choiceLetter, t } from '../../i18n';
import { Tip } from '../common/Tip';
import { VerdictChip } from '../common/VerdictChip';

/** One answer in the monitor table, styled by its verdict. */
export function MonitorCell({ cell }: { cell: Cell }) {
  const { answer } = cell;
  if (!answer) return <VerdictChip verdict="none" ariaLabel={t.monitor.noAnswer}>{t.monitor.noAnswerGlyph}</VerdictChip>;
  if (typeof answer.value === 'string') {
    return (
      <Tip text={answer.value}>
        <VerdictChip verdict={cell.verdict} ariaLabel={t.monitor.textAnswer}>
          {t.monitor.textAnswerGlyph}
        </VerdictChip>
      </Tip>
    );
  }
  return <VerdictChip verdict={cell.verdict}>{choiceLetter(answer.value)}</VerdictChip>;
}
