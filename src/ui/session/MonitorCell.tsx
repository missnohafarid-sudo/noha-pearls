import type { MonitorCell as Cell } from '../../domain/analytics';
import { choiceLetter, t } from '../../i18n';
import { GroupGlyph } from '../common/GroupGlyph';
import { Tip } from '../common/Tip';
import { VerdictChip } from '../common/VerdictChip';

/** One answer in the monitor table, styled by its verdict; an answer her group's shared device gave carries a small group mark and says so by name. */
export function MonitorCell({ cell }: { cell: Cell }) {
  const { answer, byGroup } = cell;
  if (!answer) return <VerdictChip verdict="none" ariaLabel={t.monitor.noAnswer}>{t.monitor.noAnswerGlyph}</VerdictChip>;
  const { value } = answer;
  const [glyph, name, text] =
    typeof value === 'string' ? [t.monitor.textAnswerGlyph, t.monitor.textAnswer, value] : [choiceLetter(value), choiceLetter(value), null];
  const chip = (
    <VerdictChip verdict={cell.verdict} ariaLabel={byGroup ? t.monitor.groupAnswerOf(name) : text === null ? undefined : name}>
      {glyph}
      {byGroup && <GroupGlyph />}
    </VerdictChip>
  );
  const tip = text === null ? (byGroup ? t.common.groupAnswer : null) : byGroup ? t.monitor.groupAnswerOf(text) : text;
  return tip === null ? chip : <Tip text={tip}>{chip}</Tip>;
}
