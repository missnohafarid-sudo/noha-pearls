import { useEffect, useMemo, useRef } from 'react';
import { RewardIndex } from '../../../domain/analytics';
import { answerStatusByGroup } from '../../../domain/answering';
import type { Answer, Lesson, Participant, Session, SessionRoster, Slide } from '../../../domain/models';
import { pearlsEarned, publishedKeys, scoreboard } from '../../../domain/scoring';
import { t } from '../../../i18n';
import { Loading } from '../../common/PageState';
import { useRewards } from '../../hooks/data';
import { useTeacherHearts } from '../../hooks/useTeacherHearts';
import { PEARL_PANEL_ID } from './panelId';
import { PearlGroupCard } from './PearlGroupCard';
import './pearlPanel.css';

interface Props {
  session: Session;
  lesson: Lesson;
  slide: Slide | undefined;
  roster: SessionRoster;
  participants: readonly Participant[];
  answers: readonly Answer[];
  onClose: () => void;
}

/** Over the slide's bottom corner: every group with its pearls, who has answered what is on screen, and the hearts the teacher gives to groups and students. */
export function PearlPanel({ session, lesson, slide, roster, participants, answers, onClose }: Props) {
  const rewards = useRewards(session.id);
  const heartFor = useTeacherHearts(session);
  const index = useMemo(() => new RewardIndex(rewards ?? []), [rewards]);
  const pearls = useMemo(() => new Map(scoreboard(lesson, roster, answers, publishedKeys(session)).map((score) => [score.groupId, pearlsEarned(score)])), [lesson, roster, answers, session]);
  const statuses = answerStatusByGroup(slide, roster, participants, answers);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => panelRef.current?.focus({ preventScroll: true }), []);

  return (
    <aside ref={panelRef} id={PEARL_PANEL_ID} className="pearl-panel" aria-label={t.pearlPanel.title} tabIndex={-1}>
      <header className="pearl-panel__head">
        <h2 className="card__title">{t.pearlPanel.title}</h2>
        <button type="button" className="btn btn--small" onClick={onClose}>
          {t.common.close}
        </button>
      </header>
      {rewards ? (
        <div className="pearl-panel__groups">
          {statuses.map((entry) => (
            <PearlGroupCard
              key={entry.group.id}
              entry={entry}
              pearls={pearls.get(entry.group.id) ?? 0}
              groupHearts={index.groupTotal(entry.group, roster.students)}
              studentHearts={(studentId) => index.of({ kind: 'student', id: studentId }).total}
              giveTo={(target) => heartFor(roster, target)}
            />
          ))}
        </div>
      ) : (
        <Loading />
      )}
    </aside>
  );
}
