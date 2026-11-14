import { useId } from 'react';
import { THEMES, themeOf, type Theme } from '../../domain/themes';
import { t } from '../../i18n';
import { useAttempt } from '../common/useAttempt';
import { useSite } from '../hooks/data';
import { useServices } from '../ServicesContext';
import { useDisclosure } from './useDisclosure';
import './themePicker.css';

const pearlClass = (shade: Theme) => `pearl pearl--${THEMES.indexOf(shade) + 1}`;

/** The teacher's round pearl button in the bar: it lists the seven looks, and the one chosen becomes the look of the whole site. */
export function ThemePicker() {
  const site = useSite();
  const { content } = useServices();
  const { error, attempt } = useAttempt();
  const listId = useId();
  const { open, root, button, list, close, toggle, onKeyDown } = useDisclosure<HTMLDivElement>();
  const current = themeOf(site);

  const choose = async (shade: Theme) => {
    close();
    if (site) await attempt(() => content.updateSite({ ...site, theme: shade }));
  };

  return (
    <div className="theme-picker" ref={root} onKeyDown={onKeyDown}>
      <button type="button" ref={button} className="theme-picker__button" aria-label={t.shell.theme.button} aria-expanded={open} aria-controls={listId} disabled={!site} onClick={toggle}>
        <span className={pearlClass(current)} aria-hidden="true" />
      </button>
      <div id={listId} ref={list} className="theme-picker__list" role="group" aria-label={t.shell.theme.listLabel} hidden={!open}>
        {THEMES.map((shade) => (
          <button key={shade} type="button" className="theme-picker__option" aria-current={shade === current ? 'true' : undefined} onClick={() => void choose(shade)}>
            <span className={pearlClass(shade)} aria-hidden="true" />
            {t.common.pearlShade[shade]}
          </button>
        ))}
      </div>
      {error && <p className="notice notice--bad theme-picker__notice" role="alert">{error}</p>}
    </div>
  );
}
