import { useState } from 'react';
import { onlyOne } from '../../domain/lists';
import type { Id, SchoolClass, Teacher } from '../../domain/models';
import { hasGroupsToStart } from '../../domain/sessions';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import '../forms/forms.css';
import { Select } from '../forms/Select';
import { useClassRoster, useClasses, useTeachers } from '../hooks/data';
import { classRoute, navigate, sessionRoute } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import { useServices } from '../ServicesContext';

const tf = t.session.startForm;

interface PickProps {
  label: string;
  placeholder: string;
  items: readonly { id: Id; name: string }[];
  /** The chosen item's id, or '' for none. */
  value: Id;
  onPick: (id: Id) => void;
}

function Pick({ label, placeholder, items, value, onPick }: PickProps) {
  const choices = items.map((item) => ({ value: item.id, label: item.name }));
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <Select options={value === '' ? [{ value: '', label: placeholder }, ...choices] : choices} value={value} onChange={onPick} />
    </label>
  );
}

/**
 * Starts a class of `lessonId`: she picks a class and a teacher, unless there is only one of either,
 * which is chosen already. What is missing is said, with the link to where it is added.
 */
export function StartForm({ lessonId }: { lessonId: Id }) {
  const classes = useClasses();
  const teachers = useTeachers();
  if (!classes || !teachers) return <Loading />;

  if (classes.length === 0 || teachers.length === 0) {
    return (
      <div className="stack stack--tight">
        {classes.length === 0 && (
          <>
            <p className="notice">{tf.noClasses}</p>
            <div className="row">
              <RouteLink to={classRoute('roster')} className="btn btn--small">
                {tf.toClasses}
              </RouteLink>
            </div>
          </>
        )}
        {teachers.length === 0 && <p className="notice">{tf.noTeachers}</p>}
      </div>
    );
  }

  return <StartPicker lessonId={lessonId} classes={classes} teachers={teachers} />;
}

interface StartPickerProps {
  lessonId: Id;
  classes: readonly SchoolClass[];
  teachers: readonly Teacher[];
}

function StartPicker({ lessonId, classes, teachers }: StartPickerProps) {
  const { sessions } = useServices();
  const [picked, setPicked] = useState({ classId: '', teacherId: '' });
  const [refused, setRefused] = useState(false);
  const schoolClass = onlyOne(classes) ?? classes.find((candidate) => candidate.id === picked.classId) ?? null;
  const teacher = onlyOne(teachers) ?? teachers.find((candidate) => candidate.id === picked.teacherId) ?? null;
  const roster = useClassRoster(schoolClass?.id);
  const hasGroups = roster === undefined || hasGroupsToStart(roster.groups);

  const pick = (change: Partial<typeof picked>) => {
    setRefused(false);
    setPicked({ ...picked, ...change });
  };

  const start = async () => {
    if (!schoolClass || !teacher) return;
    const started = await sessions.start(lessonId, schoolClass.id, teacher.id);
    setRefused(started === null);
    if (started) navigate(sessionRoute('session', started.code));
  };

  return (
    <div className="stack">
      <div className="row">
        <Pick label={tf.class} placeholder={tf.pickClass} items={classes} value={schoolClass?.id ?? ''} onPick={(classId) => pick({ classId })} />
        <Pick label={tf.teacher} placeholder={tf.pickTeacher} items={teachers} value={teacher?.id ?? ''} onPick={(teacherId) => pick({ teacherId })} />
      </div>
      {!hasGroups && (
        <>
          <p className="notice notice--bad">{tf.noGroups}</p>
          <div className="row">
            <RouteLink to={classRoute('roster', schoolClass?.id)} className="btn btn--small">
              {tf.toClasses}
            </RouteLink>
          </div>
        </>
      )}
      {refused && hasGroups && <p className="notice notice--bad">{tf.refused}</p>}
      <div className="row">
        <button type="button" className="btn btn--primary" disabled={!schoolClass || !teacher || !hasGroups} onClick={() => void start()}>
          {t.session.start}
        </button>
      </div>
    </div>
  );
}
