import { t } from '../../i18n';

export const WAITING_LIST_ID = 'admission-waiting-list';

interface WaitingCountButtonProps {
  count: number;
  className?: string;
  onPress?: () => void;
}

/** The count of devices waiting to be let in; pressing it brings the waiting list into view. */
export function WaitingCountButton({ count, className = '', onPress }: WaitingCountButtonProps) {
  const press = () => {
    onPress?.();
    document.getElementById(WAITING_LIST_ID)?.scrollIntoView({ block: 'start' });
  };
  return (
    <button type="button" className={`chip chip--accent admission__count ${className}`.trim()} onClick={press}>
      {t.session.admission.waitingCount(count)}
    </button>
  );
}
