import { useState } from 'react';
import { MAX_CARD_NUMBER, MIN_CARD_NUMBER } from '../../domain/cards';
import type { Group, Id, SchoolClass, Student } from '../../domain/models';
import { GROUP_COLORS, groupById, membersOf } from '../../domain/roster';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { Loading } from '../common/PageState';
import { toneStyle } from '../common/tone';
import { useAttempt } from '../common/useAttempt';
import type { FieldSpec } from '../forms/SchemaForm';
import { SchemaForm } from '../forms/SchemaForm';
import { useClassRoster } from '../hooks/data';
import { AddClassButton } from '../roster/AddClassButton';
import { ClassSwitcher } from '../roster/ClassSwitcher';
import { RosterImportPanel } from '../roster/RosterImportPanel';
import { SchoolClassPanel } from '../roster/SchoolClassPanel';
import { useShownClass } from '../roster/useShownClass';
import { classRoute } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import { AdminPanel } from '../shell/AdminPanel';
import { useServices } from '../ServicesContext';
import './roster.css';

type Selection = { kind: 'group' | 'student'; id: Id } | null;

const GROUP_FIELDS: readonly FieldSpec<Group>[] = [
  { key: 'name', label: t.roster.fields.name, kind: 'text' },
  {
    key: 'color',
    label: t.roster.fields.color,
    kind: 'select',
    options: () => GROUP_COLORS.map((color, i) => ({ value: color, label: t.roster.colorNames[i] ?? color })),
  },
];

function studentFields(groups: readonly Group[]): FieldSpec<Student>[] {
  return [
    { key: 'name', label: t.roster.fields.name, kind: 'text' },
    { key: 'cardNumber', label: t.roster.fields.cardNumber, kind: 'number', min: MIN_CARD_NUMBER, max: MAX_CARD_NUMBER },
    {
      key: 'groupId',
      label: t.roster.fields.group,
      kind: 'select',
      options: () => groups.map((group) => ({ value: group.id, label: group.name })),
    },
  ];
}

/** The classes to switch between, and the groups and students of the one shown; editing happens in the side panel. */
export function RosterPage({ classId }: { classId: Id | undefined }) {
  const found = useShownClass('roster', classId);
  if (!found) return <Loading />;
  const { classes, shown } = found;

  return (
    <div className="page">
      <div className="row row--between">
        <h1 className="page__title">{t.shell.nav.roster}</h1>
        {shown && (
          <RouteLink to={classRoute('cards', shown.id)} className="btn btn--primary">
            {t.roster.openCards}
          </RouteLink>
        )}
      </div>
      <ClassSwitcher page="roster" classes={classes} current={shown}>
        <AddClassButton />
      </ClassSwitcher>
      {shown ? (
        <ClassList key={shown.id} schoolClass={shown} />
      ) : (
        <p className="muted">{classId === undefined ? t.roster.noClass : t.roster.classNotFound}</p>
      )}
    </div>
  );
}

/** The groups of one class with their students. */
function ClassList({ schoolClass }: { schoolClass: SchoolClass }) {
  const { roster } = useServices();
  const loaded = useClassRoster(schoolClass.id);
  const [selection, setSelection] = useState<Selection>(null);
  const { error, attempt: run, clearError } = useAttempt();
  /** Counts rejected saves; each one resets the form to the stored record. */
  const [rejections, setRejections] = useState(0);

  if (!loaded) return <Loading />;
  const { groups, students } = loaded;

  const selectedGroup = selection?.kind === 'group' ? groupById(groups, selection.id) : undefined;
  const selectedStudent = selection?.kind === 'student' ? students.find((s) => s.id === selection.id) : undefined;

  const attempt = async (command: () => Promise<unknown>): Promise<boolean> => {
    const done = await run(command);
    if (!done) setRejections((n) => n + 1);
    return done;
  };

  const select = (next: Selection) => {
    clearError();
    setSelection(next);
  };

  const addGroup = async () => {
    const group = await roster.addGroup(schoolClass.id, t.roster.defaultGroupName);
    select({ kind: 'group', id: group.id });
  };

  const addStudent = async (groupId: Id) => {
    const student = await roster.addStudent(t.roster.defaultStudentName, groupId);
    select({ kind: 'student', id: student.id });
  };

  const remove = async (command: () => Promise<unknown>) => {
    if (await attempt(command)) setSelection(null);
  };

  return (
    <>
      <div className="grid">
        {groups.map((group) => (
          <section key={group.id} className="card card--tone stack" style={toneStyle(group.color)}>
            <button
              type="button"
              className="roster__name card__title"
              aria-pressed={selectedGroup?.id === group.id}
              onClick={() => select({ kind: 'group', id: group.id })}
            >
              {group.name}
            </button>
            <GroupStudents
              students={membersOf(group.id, students)}
              selectedId={selectedStudent?.id}
              onSelect={(id) => select({ kind: 'student', id })}
            />
            <button type="button" className="btn btn--small" onClick={() => void addStudent(group.id)}>
              {t.roster.addStudent}
            </button>
          </section>
        ))}
      </div>

      <AdminPanel title={t.roster.panelGroups}>
        <button type="button" className="btn" onClick={() => void addGroup()}>
          {t.roster.addGroup}
        </button>
      </AdminPanel>

      <AdminPanel title={t.roster.panelEdit}>
        <div className="stack">
          {error && <p className="notice notice--bad">{error}</p>}
          {selectedGroup && (
            <>
              <SchemaForm<Group>
                fields={GROUP_FIELDS}
                value={selectedGroup}
                resetKey={`${selectedGroup.id}:${rejections}`}
                onChange={(next) => void attempt(() => roster.saveGroup(next))}
              />
              <ConfirmButton onConfirm={() => void remove(() => roster.removeGroup(selectedGroup.id))}>
                {t.roster.deleteGroup}
              </ConfirmButton>
            </>
          )}
          {selectedStudent && (
            <>
              <SchemaForm<Student>
                fields={studentFields(groups)}
                value={selectedStudent}
                resetKey={`${selectedStudent.id}:${rejections}`}
                onChange={(next) => void attempt(() => roster.saveStudent(next))}
              />
              <ConfirmButton onConfirm={() => void remove(() => roster.removeStudent(selectedStudent.id))}>
                {t.roster.deleteStudent}
              </ConfirmButton>
            </>
          )}
          {!selectedGroup && !selectedStudent && <p className="muted">{t.roster.pickHint}</p>}
        </div>
      </AdminPanel>

      <SchoolClassPanel schoolClass={schoolClass} />
      <RosterImportPanel classId={schoolClass.id} />
    </>
  );
}

interface GroupStudentsProps {
  students: readonly Student[];
  selectedId: Id | undefined;
  onSelect: (id: Id) => void;
}

/** The rows of one group: card number and name. */
function GroupStudents({ students, selectedId, onSelect }: GroupStudentsProps) {
  if (students.length === 0) return <p className="muted">{t.roster.noStudents}</p>;
  return (
    <ul className="roster__list list-reset">
      {students.map((student) => (
        <li key={student.id}>
          <button
            type="button"
            className="roster__student"
            aria-pressed={selectedId === student.id}
            onClick={() => onSelect(student.id)}
          >
            <span className="chip">{t.roster.cardNumber(student.cardNumber)}</span>
            <span>{student.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
