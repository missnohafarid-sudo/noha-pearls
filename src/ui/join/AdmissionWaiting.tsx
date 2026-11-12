import { t } from '../../i18n';
import { LeaveLink } from './LeaveLink';
import { StatusMessage } from './StatusMessage';

interface AdmissionWaitingProps {
  named: boolean;
  /** Set when her name is also held or asked for by another device: the number that tells the two requests apart. */
  requestNumber: number | null;
  onChangeName: () => void;
}

function hintFor({ named, requestNumber }: AdmissionWaitingProps): string {
  if (requestNumber !== null) return t.join.admissionHintMoved;
  return named ? t.join.admissionHintNamed : t.join.admissionHintShared;
}

/** What a device shows until the teacher lets it in. */
export function AdmissionWaiting(props: AdmissionWaitingProps) {
  return (
    <StatusMessage title={t.join.admissionTitle} hint={hintFor(props)}>
      {props.requestNumber !== null && <strong>{t.join.requestNumber(props.requestNumber)}</strong>}
      <button type="button" className="btn" onClick={props.onChangeName}>
        {t.join.changeName}
      </button>
      <LeaveLink />
    </StatusMessage>
  );
}
