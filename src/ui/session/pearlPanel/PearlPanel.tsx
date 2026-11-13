import { useEffect, useMemo, useRef } from 'react';
import { RewardIndex } from '../../../domain/analytics';
import { answerStatusByGroup } from '../../../domain/answering';
import type { Answer, Id, Lesson, Participant, Session, SessionRoster, Slide, SubjectRef } from '../../../domain/models';
import { pearlsEarned, publishedKeys, scoreboard } from '../../../domain/scoring';
import { t } from '../../../i18n';
import { Loading } from '../../common/PageState';
import { useRewards } from '../../hooks/data';
import { useTeacherHearts } from '../../hooks/useTeacherHearts';
import { PEARL_PANEL_ID, PEARL_TABPANEL_ID, pearlTabId } from './panelId';
import { PearlGroupTab } from './PearlGroupTab';
import { PearlOverview } from './PearlOverview';
import { PearlTabs } from './PearlTabs';
import './pearlPanel.css';

interface Props {
  session: Session;
  lesson: Lesson;
  slide: Slide | undefined;
  roster: SessionRoster;
  participants: readonly Participant[];
  answers: readonly Answer[];
  /** The shown tab: a group's id, or null for the overview. A group that is gone shows the overview. */
  tab: Id | null;
  onTab: (group: Id | null) => void;
  onClose: () => void;
}

/** Over the slide's bottom corner: every group with its pearls, who has answered what is on screen, and the hearts the teacher gives to groups and students. */
export function PearlPanel({ session, lesson, slide, roster, participants, answers, tab, onTab, onClose }: Props) {
  const rewards = useRewards(session.id);
  const heartFor = useTeacherHearts(session);
  const index = useMemo(() => new RewardIndex(rewards ?? []), [rewards]);
  const pearls = useMemo(() => new Map(scoreboard(lesson, roster, answers, publishedKeys(session)).map((score) => [score.groupId, pearlsEarned(score)])), [lesson, roster, answers, session]);
  const groups = answerStatusByGroup(slide, roster, participants, answers).map((entry) => ({
    entry,
    pearls: pearls.get(entry.group.id) ?? 0,
    groupHearts: index.groupTotal(entry.group, roster.students),
    studentHearts: (studentId: Id) => index.of({ kind: 'student', id: studentId }).total,
    giveTo: (target: SubjectRef) => heartFor(roster, target),
  }));
  const shown = groups.find(({ entry }) => entry.group.id === tab);
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
      <PearlTabs groups={roster.groups} selected={shown ? tab : null} onSelect={onTab} />
      <div id={PEARL_TABPANEL_ID} role="tabpanel" aria-labelledby={pearlTabId(shown ? tab : null)} className="pearl-panel__body">
        {!rewards ? <Loading /> : shown ? <PearlGroupTab {...shown} /> : <PearlOverview groups={groups} onOpenGroup={onTab} />}
      </div>
    </aside>
  );
}
