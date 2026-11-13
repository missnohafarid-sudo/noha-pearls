import type { Session } from '../../domain/models';
import { t } from '../../i18n';
import { toneStyle } from '../common/tone';
import { useSeenRoster } from '../hooks/byCode';
import { RouteLink } from '../routing/useRoute';
import './choices.css';

/** One button per group, each opening the join page of that group of the session's class. */
export function GroupChoices({ session }: { session: Session }) {
  const roster = useSeenRoster(session.code);
  return (
    <div className="stack stack--tight">
      <p>{t.home.join.chooseGroup}</p>
      <div className="row">
        {roster?.groups.map((group) => (
          <span key={group.id} className="join-group" style={toneStyle(group.color)}>
            <RouteLink to={{ name: 'join', code: session.code, groupId: group.id }} className="btn">
              {group.name}
            </RouteLink>
          </span>
        ))}
      </div>
    </div>
  );
}
