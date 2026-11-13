import type { AnswerScope } from '../../domain/models';
import { t } from '../../i18n';

/** One person, or several: the two shapes the badge tells apart. */
function ScopeIcon({ scope }: { scope: AnswerScope }) {
  return (
    <svg className="scope-badge__icon" viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {scope === 'group' ? (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M6.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="4.8" cy="10" r="2" />
          <path d="M1.5 18c0-2 1.4-3.6 3.3-3.8" />
          <circle cx="19.2" cy="10" r="2" />
          <path d="M22.5 18c0-2-1.4-3.6-3.3-3.8" />
        </>
      ) : (
        <>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        </>
      )}
    </svg>
  );
}

/** Says who answers a question: every student for herself, or one answer for the whole group. */
export function ScopeBadge({ scope }: { scope: AnswerScope }) {
  return (
    <span className={`scope-badge scope-badge--${scope}`}>
      <ScopeIcon scope={scope} />
      {t.common.scope[scope]}
    </span>
  );
}
