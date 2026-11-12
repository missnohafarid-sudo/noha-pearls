import type { Teacher } from '../../domain/models';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { useAttempt } from '../common/useAttempt';
import { SchemaForm, type FieldSpec } from '../forms/SchemaForm';
import { useTeachers } from '../hooks/data';
import { AdminPanel } from '../shell/AdminPanel';
import { useServices } from '../ServicesContext';

const tt = t.session.teachers;

const FIELDS: readonly FieldSpec<Teacher>[] = [{ kind: 'text', key: 'name', label: tt.name }];

/** The list of teachers a class can be started by: add a name, rename it, remove it. */
export function TeachersPanel() {
  const { teachers: service } = useServices();
  const teachers = useTeachers();
  const { error, attempt } = useAttempt();
  if (!teachers) return null;

  return (
    <AdminPanel title={tt.title}>
      <div className="stack">
        {error && <p className="notice notice--bad">{error}</p>}
        {teachers.length === 0 && <p className="muted">{tt.none}</p>}
        {teachers.map((teacher) => (
          <div key={teacher.id} className="stack stack--tight">
            <SchemaForm<Teacher> fields={FIELDS} value={teacher} resetKey={teacher.id} onChange={(next) => void attempt(() => service.rename(teacher.id, next.name))} />
            <ConfirmButton onConfirm={() => void attempt(() => service.remove(teacher.id))}>{tt.remove}</ConfirmButton>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => void attempt(() => service.add(tt.defaultName))}>
          {tt.add}
        </button>
      </div>
    </AdminPanel>
  );
}
