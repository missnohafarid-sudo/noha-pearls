import { useState } from 'react';
import type { Group, Id, Session, Student } from '../../domain/models';
import { isPresent } from '../../domain/attendance';
import { isUnresponsive } from '../../domain/engagement';
import { membersOf } from '../../domain/roster';
import { t } from '../../i18n';
import { FullScreenOverlay } from '../common/FullScreenOverlay';
import { Loading } from '../common/PageState';
import { toneStyle } from '../common/tone';
import { Select } from '../forms/Select';
import { useAnswers, useLesson, useSessionRoster } from '../hooks/data';
import { useServices } from '../ServicesContext';
import { StudentStatus } from './StudentStatus';
import './sessionGroups.css';

const tg = t.session.groupsToday;

/** The name of a group, edited in place and saved when she leaves the field or presses Enter. */
function GroupName({ sessionId, group }: { sessionId: Id; group: Group }) {
  const { sessionRoster } = useServices();
  const [draft, setDraft] = useState(group.name);
  const save = async () => {
    const saved = draft.trim() !== group.name && (await sessionRoster.renameGroup(sessionId, group.id, draft));
    if (!saved) setDraft(group.name);
  };
  return (
    <input
      className="input session-groups__name"
      aria-label={tg.groupName}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
    />
  );
}

function AddStudent({ sessionId, groupId }: { sessionId: Id; groupId: Id }) {
  const { sessionRoster } = useServices();
  const [name, setName] = useState('');
  const submit = async () => {
    if (await sessionRoster.addStudent(sessionId, name, groupId)) setName('');
  };
  return (
    <form
      className="row session-groups__add"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input className="input" aria-label={tg.addStudent} placeholder={tg.newStudentName} value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit" className="btn btn--small" disabled={name.trim() === ''}>
        {tg.add}
      </button>
    </form>
  );
}

interface StudentRowProps {
  sessionId: Id;
  student: Student;
  groups: readonly Group[];
  present: boolean;
  unresponsive: boolean;
}

function StudentRow({ sessionId, student, groups, present, unresponsive }: StudentRowProps) {
  const { sessionRoster } = useServices();
  return (
    <li className="session-groups__student">
      <span>
        {student.name} <span className="muted">{t.roster.cardNumber(student.cardNumber)}</span>
      </span>
      <StudentStatus
        present={present}
        unresponsive={unresponsive}
        onSetPresent={(next) => void (next ? sessionRoster.markPresent(sessionId, student.id) : sessionRoster.markAbsent(sessionId, student.id))}
      />
      <Select
        className="session-groups__move"
        aria-label={tg.moveStudent(student.name)}
        options={groups.map((group) => ({ value: group.id, label: group.name }))}
        value={student.groupId}
        onChange={(groupId) => void sessionRoster.moveStudent(sessionId, student.id, groupId)}
      />
    </li>
  );
}

/** Full-screen list of the groups of one class and their students, to regroup them for today only. */
export function SessionGroups({ session, onClose }: { session: Session; onClose: () => void }) {
  const roster = useSessionRoster(session);
  const lesson = useLesson(session.lessonId);
  const answers = useAnswers(session.id);
  return (
    <FullScreenOverlay label={tg.open} title={tg.open} onClose={onClose}>
      <div className="session-groups">
        <p className="muted">{tg.note}</p>
        {!roster ? (
          <Loading />
        ) : (
          <div className="session-groups__list">
            {roster.groups.map((group) => {
              const members = membersOf(group.id, roster.students);
              return (
                <section key={group.id} className="card card--tone stack" style={toneStyle(group.color)}>
                  <GroupName key={group.name} sessionId={session.id} group={group} />
                  {members.length === 0 ? (
                    <p className="muted">{tg.noStudents}</p>
                  ) : (
                    <ul className="list-reset stack stack--tight">
                      {members.map((student) => (
                        <StudentRow
                          key={student.id}
                          sessionId={session.id}
                          student={student}
                          groups={roster.groups}
                          present={isPresent(roster, student.id)}
                          unresponsive={!!lesson && !!answers && isUnresponsive(session, lesson, roster, answers, student.id)}
                        />
                      ))}
                    </ul>
                  )}
                  <AddStudent sessionId={session.id} groupId={group.id} />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </FullScreenOverlay>
  );
}
