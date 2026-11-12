import type { SchoolClass } from '../../domain/models';
import { t } from '../../i18n';
import { AdminPanel } from '../shell/AdminPanel';
import { ClearingNotice } from './ClearingNotice';
import { DeleteRangeTool } from './DeleteRangeTool';
import { YearEndTool } from './YearEndTool';
import './retention.css';

/** The admin's tools for the school year: when the students' data is deleted, and, for the class list the page shows, deleting its ended classes between two dates. */
export function SchoolYearSection({ schoolClass }: { schoolClass: SchoolClass | null }) {
  return (
    <AdminPanel title={t.retention.title}>
      <div className="stack">
        <ClearingNotice />
        <YearEndTool />
        {schoolClass && <DeleteRangeTool key={schoolClass.id} schoolClass={schoolClass} />}
      </div>
    </AdminPanel>
  );
}
