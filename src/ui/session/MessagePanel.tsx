import { useState } from 'react';
import type { Group, Session } from '../../domain/models';
import { t } from '../../i18n';
import { Select } from '../forms/Select';
import { AdminPanel } from '../shell/AdminPanel';
import { useServices } from '../ServicesContext';

/** Side-panel form that shows a message on the groups' devices. */
export function MessagePanel({ session, groups }: { session: Session; groups: readonly Group[] }) {
  const { sessions } = useServices();
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');

  const send = () => {
    if (text.trim() === '') return;
    void sessions.sendMessage(session.id, text, target === '' ? null : target);
    setText('');
  };

  return (
    <AdminPanel title={t.session.messageTitle}>
      <form
        className="stack stack--tight"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Select
          aria-label={t.session.messageTo}
          options={[{ value: '', label: t.session.allGroups }, ...groups.map((group) => ({ value: group.id, label: group.name }))]}
          value={target}
          onChange={setTarget}
        />
        <input className="input" aria-label={t.session.messageText} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn--primary">
          {t.session.send}
        </button>
      </form>
      {session.message && (
        <div className="notice stack stack--tight">
          <span className="muted">{t.session.currentMessage}</span>
          <span>{session.message.text}</span>
          <button type="button" className="btn btn--small" onClick={() => void sessions.clearMessage(session.id)}>
            {t.session.hideMessage}
          </button>
        </div>
      )}
    </AdminPanel>
  );
}
