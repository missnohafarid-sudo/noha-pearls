import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Id } from '../../domain/models';
import type { MemberView } from '../../domain/sharedDevice';
import { t } from '../../i18n';
import { toneStyle } from '../common/tone';
import './memberAnswers.css';
import { useNameDrag } from './useNameDrag';

interface MemberAnswersProps {
  questionId: Id;
  /** The group's colour, worn by the names. */
  color: string;
  members: MemberView[];
  /** False once the question is closed: the names stay where they are and nothing can be moved. */
  open: boolean;
  /** Gives one student the answer. */
  onGive: (studentId: Id, option: number) => void;
  /** What an option does while no name is chosen: it answers for the whole group. */
  onGroupAnswer: (option: number) => void;
  /** Draws the slide with the slots to put under its options and the answer handler to give it. */
  children: (slots: { underOption: (index: number) => ReactNode; onAnswer: ((value: number | string) => void) | null }) => ReactNode;
}

/**
 * A shared device's way to answer an individual choice question one student at a time: her name is moved onto an option
 * (dragged, or chosen with a tap and then the option), and then shows under that option.
 */
export function MemberAnswers({ questionId, color, members, open, onGive, onGroupAnswer, children }: MemberAnswersProps) {
  const [chosen, setChosen] = useState<Id | null>(null);
  const chosenMember = members.find((member) => member.id === chosen && member.helped) ?? null;
  const give = (studentId: Id, option: number) => {
    setChosen(null);
    onGive(studentId, option);
  };
  const drag = useNameDrag(open, give, (id) => setChosen((now) => (now === id ? null : id)));
  const dragged = members.find((member) => member.id === drag.dragging && member.helped);

  useEffect(() => {
    if (!chosen) return undefined;
    const release = (event: KeyboardEvent) => event.key === 'Escape' && setChosen(null);
    document.addEventListener('keydown', release);
    return () => document.removeEventListener('keydown', release);
  }, [chosen]);

  const answerOption = (value: number | string) => {
    if (typeof value !== 'number') return;
    if (chosenMember) give(chosenMember.id, value);
    else onGroupAnswer(value);
  };

  const chip = (member: MemberView, ownPick: boolean) => {
    const movable = open && member.helped;
    return (
      <li key={member.id}>
        <button
          type="button"
          className={`chip name-chip${ownPick ? '' : ' name-chip--group'}${member.id === drag.dragging ? ' name-chip--lifted' : ''}`}
          aria-pressed={movable ? chosen === member.id : undefined}
          aria-label={ownPick ? undefined : t.join.countsWithGroup(member.name)}
          disabled={!movable}
          {...drag.handlersOf(member.id)}
        >
          {member.name}
        </button>
      </li>
    );
  };

  const underOption = (index: number) => {
    const here = members.filter((member) => member.helped && member.answers[questionId]?.value === index);
    return here.length > 0 && <ul className="member-pick">{here.map((member) => chip(member, member.answers[questionId]?.from === 'own'))}</ul>;
  };

  return (
    <div className="member-answers" style={toneStyle(color)}>
      <ul className="member-row" aria-label={t.join.groupNames}>
        {members.map((member) =>
          member.helped ? (
            chip(member, true)
          ) : (
            <li key={member.id}>
              <span className="chip name-chip name-chip--away" aria-disabled="true">
                {member.name}
                <small>{t.join.onOwnDevice}</small>
              </span>
            </li>
          ),
        )}
      </ul>
      {open && chosenMember && <p className="notice">{t.join.choosingFor(chosenMember.name)}</p>}
      {children({ underOption, onAnswer: open ? answerOption : null })}
      {dragged &&
        createPortal(
          <span ref={drag.ghost} className="chip name-chip name-chip--ghost" style={toneStyle(color)}>
            {dragged.name}
          </span>,
          document.body,
        )}
    </div>
  );
}
