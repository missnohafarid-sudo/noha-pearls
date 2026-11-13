import { useEffect } from 'react';
import { useCardResults } from '../hooks/byCode';

/** Asks whether a card number read by the camera is a student of this class; says so once it is. It shows nothing. */
export function CardProbe({ code, card, onFound }: { code: string; card: number; onFound: (card: number) => void }) {
  const results = useCardResults(code, card);
  const found = results !== undefined && results !== null;
  useEffect(() => {
    if (found) onFound(card);
  }, [found, card, onFound]);
  return null;
}
