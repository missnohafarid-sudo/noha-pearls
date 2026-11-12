import { t } from '../../i18n';
import { classRoute, navigate } from '../routing/routes';
import { useServices } from '../ServicesContext';

/** Adds a class list and opens it on the roster page. */
export function AddClassButton() {
  const { roster } = useServices();
  const add = async () => {
    const created = await roster.addClass(t.roster.defaultClassName);
    navigate(classRoute('roster', created.id));
  };

  return (
    <button type="button" className="btn btn--small" onClick={() => void add()}>
      {t.roster.newClass}
    </button>
  );
}
