import type { Group, PacingMode, Session } from '../../domain/models';
import { PACING_MODES, pacingOf } from '../../domain/pacing';
import { t } from '../../i18n';
import { AdminPanel } from '../shell/AdminPanel';
import { useServices } from '../ServicesContext';

function ModeButtons({ active, onPick }: { active: (mode: PacingMode) => boolean; onPick: (mode: PacingMode) => void }) {
  return (
    <div className="row">
      {PACING_MODES.map((mode) => (
        <button key={mode} type="button" className="btn btn--small" aria-pressed={active(mode)} onClick={() => onPick(mode)}>
          {t.session.pacing[mode]}
        </button>
      ))}
    </div>
  );
}

/** Side-panel control of how each group's devices move through the lesson. */
export function PacingPanel({ session, groups }: { session: Session; groups: readonly Group[] }) {
  const { sessions } = useServices();
  const ids = groups.map((g) => g.id);

  return (
    <AdminPanel title={t.session.pacingTitle}>
      <div className="stack">
        <div className="stack stack--tight">
          <strong>{t.session.allGroups}</strong>
          <ModeButtons
            active={(mode) => groups.length > 0 && groups.every((g) => pacingOf(session, g.id).mode === mode)}
            onPick={(mode) => void sessions.setPacing(session.id, ids, mode)}
          />
        </div>
        {groups.map((group) => {
          const pacing = pacingOf(session, group.id);
          return (
            <div key={group.id} className="stack stack--tight">
              <strong>{group.name}</strong>
              <ModeButtons
                active={(mode) => pacing.mode === mode}
                onPick={(mode) => void sessions.setPacing(session.id, [group.id], mode)}
              />
              {pacing.mode === 'pinned' && <span className="muted">{t.session.pinnedAt(pacing.slideIndex + 1)}</span>}
            </div>
          );
        })}
      </div>
    </AdminPanel>
  );
}
