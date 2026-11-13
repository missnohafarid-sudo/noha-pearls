import { t } from '../../i18n';

/** The class's join code, small and always on the stage so it can be read from the back of the room. */
export function ClassCodeChip({ code }: { code: string }) {
  return (
    <span className="chip class-code">
      {t.session.joinCode}
      <bdi dir="ltr" className="class-code__value">
        {code}
      </bdi>
    </span>
  );
}
