import { t } from '../../i18n';

interface Props {
  present: boolean;
  unresponsive: boolean;
  /** Absent when the class takes no more changes: the status is then only shown. */
  onSetPresent?: (present: boolean) => void;
}

/** A student's status in a class: the present/absent toggle while the class takes changes, then the unresponsive flag. */
export function StudentStatus({ present, unresponsive, onSetPresent }: Props) {
  return (
    <span className="row row--nowrap">
      {onSetPresent ? (
        <button type="button" className={present ? 'btn btn--small btn--on status__toggle' : 'btn btn--small status__toggle'} onClick={() => onSetPresent(!present)}>
          {present ? t.common.present : t.common.absent}
        </button>
      ) : (
        !present && <span className="chip">{t.common.absent}</span>
      )}
      {unresponsive && <span className="chip chip--bad">{t.common.unresponsive}</span>}
    </span>
  );
}
