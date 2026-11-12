import { t } from '../../i18n';

const HEART = '\u2764';

/** Shows the heart count of `owner`; when `onGive` is passed it is also the button that gives one. */
export function HeartButton({ owner, count, onGive }: { owner: string; count: number; onGive?: () => void }) {
  const label = t.common.heartsOf(owner, count);
  if (!onGive) {
    return (
      <span className="chip" aria-label={label}>
        {HEART} {count}
      </span>
    );
  }
  return (
    <button type="button" className="btn btn--small btn--heart" aria-label={label} onClick={onGive}>
      {HEART} {count}
    </button>
  );
}
