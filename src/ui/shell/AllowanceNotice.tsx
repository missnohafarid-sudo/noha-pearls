import { allowanceNearlyUsed } from '../../domain/abuse';
import { t } from '../../i18n';
import { useAllowanceLevel } from '../hooks/useAllowance';

/** One calm line for the teacher once the day's saving allowance is nearly used. */
export function AllowanceNotice() {
  const level = useAllowanceLevel();
  if (level === undefined || !allowanceNearlyUsed(level)) return null;
  return (
    <p className="shell__notice" role="status">
      {t.shell.allowance}
    </p>
  );
}
