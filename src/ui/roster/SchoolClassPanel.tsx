import type { SchoolClass } from '../../domain/models';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { useAttempt } from '../common/useAttempt';
import { SchemaForm, type FieldSpec } from '../forms/SchemaForm';
import { classRoute, navigate } from '../routing/routes';
import { AdminPanel } from '../shell/AdminPanel';
import { useServices } from '../ServicesContext';

const FIELDS: readonly FieldSpec<SchoolClass>[] = [{ kind: 'text', key: 'name', label: t.roster.fields.name }];

/** Renaming and removing the class the page shows. */
export function SchoolClassPanel({ schoolClass }: { schoolClass: SchoolClass }) {
  const { roster } = useServices();
  const { error, attempt } = useAttempt();

  const remove = async () => {
    if (await attempt(() => roster.removeClass(schoolClass.id))) navigate(classRoute('roster'));
  };

  return (
    <AdminPanel title={t.roster.panelClass}>
      <div className="stack">
        {error && <p className="notice notice--bad">{error}</p>}
        <SchemaForm<SchoolClass> fields={FIELDS} value={schoolClass} resetKey={schoolClass.id} onChange={(next) => void attempt(() => roster.renameClass(schoolClass.id, next.name))} />
        <ConfirmButton onConfirm={() => void remove()}>{t.roster.deleteClass}</ConfirmButton>
      </div>
    </AdminPanel>
  );
}
