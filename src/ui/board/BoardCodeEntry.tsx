import { t } from '../../i18n';
import { CodeForm } from '../join/CodeForm';
import { navigate, sessionRoute } from '../routing/routes';

/** What anyone but the teacher sees when the board has no class to show: the field for the class's code, and a word when the last code matched nothing. */
export function BoardCodeEntry({ code }: { code: string | undefined }) {
  return (
    <div className="stack stack--tight">
      {code !== undefined && <p className="notice">{t.session.unknownCode(code)}</p>}
      <p className="muted">{t.board.codePrompt}</p>
      <CodeForm submitLabel={t.board.showBoard} onSubmit={(typed) => navigate(sessionRoute('board', typed))} />
    </div>
  );
}
