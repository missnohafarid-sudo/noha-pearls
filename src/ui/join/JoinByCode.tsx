import { useEffect, useState, type FormEvent } from 'react';
import { joinLanding } from '../../domain/admission';
import { normalizeJoinCode } from '../../domain/ids';
import { t } from '../../i18n';
import type { Session } from '../../domain/models';
import { useMyParticipant, useSessionByCode, useSessionRoster } from '../hooks/data';
import { navigate } from '../routing/routes';
import { GroupChoices } from './GroupChoices';
import './choices.css';

const th = t.home.join;

/** A device that still holds a seat in this class goes straight back to it, live or ended; any other picks its group, or is told the class has ended. */
function ChooseOrReturn({ session }: { session: Session }) {
  const seat = useMyParticipant(session.id);
  const roster = useSessionRoster(session);
  const landing = seat === undefined || roster === undefined ? undefined : joinLanding(session, seat, roster.students);
  const groupId = landing?.to === 'group' ? landing.groupId : null;
  useEffect(() => {
    if (groupId) navigate({ name: 'join', code: session.code, groupId });
  }, [groupId, session.code]);
  if (landing?.to === 'choose') return <GroupChoices session={session} />;
  return landing?.to === 'ended' ? <p className="notice notice--bad">{th.ended}</p> : null;
}

/** For a student without a camera: type the session code, then pick the group. */
export function JoinByCode() {
  const [typed, setTyped] = useState('');
  const [submitted, setSubmitted] = useState('');
  const session = useSessionByCode(submitted);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(normalizeJoinCode(typed));
  };

  return (
    <div className="stack stack--tight">
      <form className="join-code row" onSubmit={submit}>
        <label className="field field--inline">
          <span className="field__label">{t.session.joinCode}</span>
          <input
            className="input"
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--primary">
          {th.submit}
        </button>
      </form>
      {submitted !== '' && session !== undefined && (session ? <ChooseOrReturn session={session} /> : <p className="notice notice--bad">{th.wrongCode}</p>)}
    </div>
  );
}
