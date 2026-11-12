import { useCallback, useState } from 'react';
import { t } from '../../i18n';
import { LessonError } from '../../services/LessonService';
import { FolderError } from '../../services/requireFolder';
import { NameError } from '../../services/requireName';
import { RetentionError } from '../../services/RetentionService';
import { RosterError } from '../../services/RosterService';
import { TeacherError } from '../../services/TeacherService';

function serviceErrorMessage(error: unknown): string {
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
