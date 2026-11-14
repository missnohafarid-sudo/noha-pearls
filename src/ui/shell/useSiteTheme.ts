import { useEffect } from 'react';
import { themeOf } from '../../domain/themes';
import { useSite } from '../hooks/data';

/** Puts the site's look on the page's root element, where tokens.css picks its colours from. */
export function useSiteTheme(): void {
  const theme = themeOf(useSite());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
