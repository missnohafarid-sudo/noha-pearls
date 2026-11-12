import { useCallback, useState } from 'react';
import { t } from '../../i18n';
import { FolderError } from '../../services/FolderService';
import { LessonError } from '../../services/LessonService';
import { NameError } from '../../services/requireName';
import { RosterError } from '../../services/RosterService';
import { TeacherError } from '../../services/TeacherService';

function serviceErrorMessage(error: unknown): string {
  if (error instanceof LessonError || error instanceof FolderError) return t.lesson.errors[error.code];
  return error instanceof RosterError || error instanceof TeacherError || error instanceof NameError ? t.roster.errors[error.code] : t.roster.errors.unknown;
}

/** Runs service commands: a refusal becomes a notice text instead of an uncaught error, and `attempt` reports whether the command went through. */
export function useAttempt() {
  const [error, setError] = useState<string | null>(null);
  const attempt = useCallback(async (command: () => Promise<unknown>): Promise<boolean> => {
    try {
      await command();
      setError(null);
      return true;
    } catch (caught) {
      setError(serviceErrorMessage(caught));
      return false;
    }
  }, []);
  return { error, attempt, clearError: () => setError(null) };
}
