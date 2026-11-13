import { useEffect } from 'react';
import type { Id } from '../../domain/models';
import { useCardResults } from '../hooks/data';

/** Asks whether a card number read by the camera is a student of this class; says so once it is. It shows nothing. */
export function CardProbe({ sessionId, card, onFound }: { sessionId: Id; card: number; onFound: (card: number) => void }) {
  const results = useCardResults(sessionId, card);
  const found = results !== undefined && results !== null;
  useEffect(() => {
    if (found) onFound(card);
  }, [found, card, onFound]);
  return null;
}
