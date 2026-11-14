import { hasHeartToTake } from '../../domain/rewards';
import { t } from '../../i18n';

const HEART = '\u2764';

interface Props {
  owner: string;
  count: number;
  onGive?: () => void;
  onTake?: () => void;
}

/** Shows the heart count of `owner`; when `onGive` is passed it is also the button that gives one, and when `onTake` is passed and there is a heart to take, a second button takes one away. */
export function HeartButton({ owner, count, onGive, onTake }: Props) {
  const label = t.common.heartsOf(owner, count);
  if (!onGive) {
    return (
      <span className="chip" aria-label={label}>
        {HEART} {count}
      </span>
    );
  }
  const takeLabel = t.common.takeHeartFrom(owner);
  return (
    <>
      <button type="button" className="btn btn--small btn--heart" aria-label={label} onClick={onGive}>
        {HEART} {count}
      </button>
      {onTake && hasHeartToTake(count) && (
        <button type="button" className="btn btn--small btn--take-heart" aria-label={takeLabel} title={takeLabel} onClick={onTake}>
          {'\u2212'}
        </button>
      )}
    </>
  );
}
