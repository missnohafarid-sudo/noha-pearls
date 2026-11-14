import { useEffect, useState } from 'react';
import { lookToShow, type Theme } from '../../domain/themes';
import { useSite } from '../hooks/data';
import { useServices } from '../ServicesContext';

/** Puts a look on the page's root element, where tokens.css picks its colours from. */
export function showLook(look: Theme): void {
  document.documentElement.dataset.theme = look;
}

/** Keeps the page's look and this device's memory of it in step with the site record; until the record arrives the remembered look stays. */
export function useSiteTheme(): void {
  const { lookMemory } = useServices();
  const site = useSite();
  const [remembered] = useState(() => lookMemory.recall());
  const look = lookToShow(site, remembered);
  const arrived = site !== undefined;
  useEffect(() => {
    showLook(look);
    if (arrived) lookMemory.remember(look);
  }, [look, arrived, lookMemory]);
}
