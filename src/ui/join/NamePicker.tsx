import { useState } from 'react';
import type { SeatLoss } from '../../domain/admission';
import type { Group, Session, Student } from '../../domain/models';
import { t } from '../../i18n';
import posterLight from '../assets/brand/poster-light.jpg';
import { toneStyle } from '../common/tone';
import { GroupChoices } from './GroupChoices';

interface NamePickerProps {
  group: Group;
  session: Session;
  /** This device had a seat a moment ago and lost it: say why above the names. */
  lost: SeatLoss | null;
  students: readonly Student[];
  /** Students whose names another device already holds. */
  heldIds: ReadonlySet<string>;
  /** `null` joins as the shared device of the whole group. */
  onPick: (studentId: string | null) => void;
}

/** Lets a device say who is holding it, or that it is the group's shared device. */
export function NamePicker({ group, session, lost, students, heldIds, onPick }: NamePickerProps) {
  const [choosingGroup, setChoosingGroup] = useState(false);
  return (
    <div className="stack">
      <img className="join__banner" src={posterLight} alt="" width={720} height={1456} />
      <header className="card card--tone" style={toneStyle(group.color)}>
        <p className="muted">{t.join.groupLabel(group.name)}</p>
        <h1 className="page__title">{t.join.chooseName}</h1>
      </header>
      {lost && <p className="notice">{lost === 'name-taken' ? t.join.nameTakenByOther : t.join.seatLost}</p>}
      {students.length === 0 && <p className="notice">{t.join.noStudents}</p>}
      <div className="stack stack--tight">
        {students.map((student) => (
          <button
            key={student.id}
            type="button"
            className="btn join__choice"
            onClick={() => onPick(student.id)}
          >
            {student.name}
            {heldIds.has(student.id) && <span className="muted join__choice-note">{t.join.nameTaken}</span>}
          </button>
        ))}
        <button type="button" className="btn btn--primary join__choice" onClick={() => onPick(null)}>
          {t.join.sharedDevice}
        </button>
      </div>
      {choosingGroup ? (
        <GroupChoices session={session} />
      ) : (
        <button type="button" className="join__link" onClick={() => setChoosingGroup(true)}>
          {t.join.wrongGroup}
        </button>
      )}
    </div>
  );
}
