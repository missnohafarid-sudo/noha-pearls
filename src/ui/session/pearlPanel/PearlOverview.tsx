import { studentProgress } from '../../../domain/answerProgress';
import { t } from '../../../i18n';
import { HeartButton } from '../../common/HeartButton';
import { PearlString } from '../../common/PearlString';
import { toneStyle } from '../../common/tone';
import { AnswerMarkChip } from './AnswerMarkChip';
import type { PearlGroupProps } from './pearlGroupProps';
import './pearlCards.css';

interface Props {
  groups: readonly PearlGroupProps[];
  onOpenGroup: (group: string) => void;
}

/** The overview tab: every group as one compact card, with who has not answered yet; pressing a card opens that group's tab. */
export function PearlOverview({ groups, onOpenGroup }: Props) {
  return (
    <div className="pearl-overview">
      {groups.map(({ entry, pearls, groupHearts, giveTo }) => {
        const { group, mark } = entry;
        const progress = studentProgress(entry);
        return (
          <section key={group.id} className="card card--tone pearl-card" style={toneStyle(group.color)}>
            <header className="pearl-card__head">
              <h3 className="pearl-card__name">
                <button type="button" className="pearl-card__open" onClick={() => onOpenGroup(group.id)}>
                  {group.name}
                </button>
              </h3>
              <HeartButton owner={group.name} count={groupHearts} onGive={giveTo({ kind: 'group', id: group.id })} />
            </header>
            <div className="pearl-card__pearls">
              <PearlString earned={pearls} />
              {mark && <AnswerMarkChip mark={mark} />}
              {progress.expected > 0 && <span className="muted">{t.common.answeredCount(progress.answered, progress.expected)}</span>}
            </div>
            {progress.waiting.length > 0 && (
              <ul className="list-reset pearl-card__waiting" aria-label={t.session.notAnswered}>
                {progress.waiting.map((student) => (
                  <li key={student.id} className="chip pearl-waiting-name">
                    {student.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
