import { PEARL_COUNT } from '../../domain/scoring';
import { t } from '../../i18n';

/** A group's score as a string of pearls: the first `earned` are lit in their colours, the rest are empty sockets. */
export function PearlString({ earned }: { earned: number }) {
  return (
    <span className="pearls" role="img" aria-label={t.common.pearlsOf(earned, PEARL_COUNT)}>
      {Array.from({ length: PEARL_COUNT }, (_, index) => (
        <span key={index} className={index < earned ? `pearl pearl--${index + 1}` : 'pearl pearl--empty'} />
      ))}
    </span>
  );
}
