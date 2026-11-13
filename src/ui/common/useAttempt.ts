import { useCallback, useState } from 'react';
import { t } from '../../i18n';
import { ConnectionLostError } from '../../services/errorRegistry';
import { LimitError } from '../../services/LimitError';
import { LessonError } from '../../services/LessonService';
import { FolderError } from '../../services/requireFolder';
import { NameError } from '../../services/requireName';
import { RetentionError } from '../../services/RetentionService';
import { RosterError } from '../../services/RosterService';
import { TeacherError } from '../../services/TeacherService';

const LIMIT_WORDS = {
  lookups: 'lookups',
  joins: 'joins',
  cards: 'cards',
  'seats-full': 'seatsFull',
  'hearts-used': 'heartsUsed',
  'answer-changes': 'answerChanges',
  'day-used': 'dayUsed',
  watches: 'watches',
} as const satisfies Record<LimitError['code'], keyof typeof t.shell.limits>;

function serviceErrorMessage(error: unknown): string {
  if (error instanceof ConnectionLostError) return t.shell.connection.lost;
  if (error instanceof LimitError) return t.shell.limits[LIMIT_WORDS[error.code]];
  if (error instanceof LessonError || error instanceof FolderError) return t.lesson.errors[error.code];
  if (error instanceof RetentionError) return t.retention.errors[error.code];
  return error instanceof RosterError || error instanceof TeacherError || error instanceof NameError ? t.roster.errors[error.code] : t.roster.errors.unknown;
}

/**
 * Runs service commands: a refusal becomes a notice text instead of an uncaught error.
 * `attemptWith` hands back what the command returned (null when it was refused); `attempt` only reports whether it went through.
 */
export function useAttempt() {
  const [error, setError] = useState<string | null>(null);
  const attemptWith = useCallback(async <T>(command: () => Promise<T>): Promise<{ value: T } | null> => {
    try {
      const value = await command();
      setError(null);
      return { value };
    } catch (caught) {
      setError(serviceErrorMessage(caught));
      return null;
    }
  }, []);
  const attempt = useCallback(async (command: () => Promise<unknown>): Promise<boolean> => (await attemptWith(command)) !== null, [attemptWith]);
  return { error, attempt, attemptWith, clearError: () => setError(null) };
}
