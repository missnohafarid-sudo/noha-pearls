import { useEffect, useMemo, useState, useSyncExternalStore, type DependencyList } from 'react';
import type { CardCodec } from '../../services/Services';
import { FolderTree } from '../../domain/folders';
import type { Answer, ClassRoster, Id, Lesson, LessonFolder, Participant, Reward, SchoolClass, Session, SessionRoster, SiteContent, Teacher } from '../../domain/models';
import { liveSessions } from '../../domain/sessions';
import { useServices } from '../ServicesContext';
import { useLive } from './useLive';

/**
 * Live data for pages. Each hook returns `undefined` while loading.
 * Hooks that take an id accept null/undefined and then stay `undefined`.
 */

type MaybeId = Id | null | undefined;

export function useAdmin(): boolean {
  const { auth } = useServices();
  return useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.isAdmin(),
  );
}

export function useSite(): SiteContent | null | undefined {
  const { content } = useServices();
  return useLive((listener) => content.watchSite(listener), [content]);
}

export function useClasses(): SchoolClass[] | undefined {
  const { roster } = useServices();
  return useLive((listener) => roster.watchClasses(listener), [roster]);
}

export function useTeachers(): Teacher[] | undefined {
  const { teachers } = useServices();
  return useLive((listener) => teachers.watchTeachers(listener), [teachers]);
}

export function useFolders(): LessonFolder[] | undefined {
  const { folders } = useServices();
  return useLive((listener) => folders.watchFolders(listener), [folders]);
}

/** The lesson folders read once per change; every question about the tree is asked of it. */
export function useFolderTree(): FolderTree | undefined {
  const folders = useFolders();
  return useMemo(() => folders && new FolderTree(folders), [folders]);
}

/** The groups and students of one school class: what its list shows and edits. */
export function useClassRoster(classId: MaybeId): ClassRoster | undefined {
  const { roster } = useServices();
  return useLive(classId ? (listener) => roster.watchRoster(classId, listener) : null, [roster, classId]);
}

/**
 * The groups and students a class (a session) uses: every screen of a session asks here and nowhere else.
 * They are the session's own copy of its class's, so the class list changing never reaches a session.
 */
export function useSessionRoster(session: Session | null | undefined): SessionRoster | undefined {
  const { sessionRoster } = useServices();
  const sessionId = session?.id;
  return useLive(sessionId ? (listener) => sessionRoster.watchRoster(sessionId, listener) : null, [sessionRoster, sessionId]);
}

export function useLessons(): Lesson[] | undefined {
  const { lessons } = useServices();
  return useLive((listener) => lessons.watchLessons(listener), [lessons]);
}

export function useLesson(lessonId: MaybeId): Lesson | null | undefined {
  const { lessons } = useServices();
  return useLive(lessonId ? (listener) => lessons.watchLesson(lessonId, listener) : null, [lessons, lessonId]);
}

export function useSessions(): Session[] | undefined {
  const { sessions } = useServices();
  return useLive((listener) => sessions.watchAll(listener), [sessions]);
}

/** The classes running now, newest first. */
export function useLiveSessions(): Session[] | undefined {
  const all = useSessions();
  return useMemo(() => all && liveSessions(all), [all]);
}

export function useSessionByCode(code: string): Session | null | undefined {
  const { sessions } = useServices();
  return useLive((listener) => sessions.watchByCode(code, listener), [sessions, code]);
}

export function useAnswers(sessionId: MaybeId): Answer[] | undefined {
  const { answers } = useServices();
  return useLive(sessionId ? (listener) => answers.watchAnswers(sessionId, listener) : null, [answers, sessionId]);
}

export function useRewards(sessionId: MaybeId): Reward[] | undefined {
  const { rewards } = useServices();
  return useLive(sessionId ? (listener) => rewards.watchRewards(sessionId, listener) : null, [rewards, sessionId]);
}

export function useParticipants(sessionId: MaybeId): Participant[] | undefined {
  const { participants } = useServices();
  return useLive(
    sessionId ? (listener) => participants.watchParticipants(sessionId, listener) : null,
    [participants, sessionId],
  );
}

/** This device's seat in the session; null when it has not joined yet. */
export function useMyParticipant(sessionId: MaybeId): Participant | null | undefined {
  const { participants } = useServices();
  return useLive(sessionId ? (listener) => participants.watchMine(sessionId, listener) : null, [participants, sessionId]);
}

/** How many ended classes of this class list have been kept; changes the moment one more is. */
export function useKeptRecordCount(classId: MaybeId): number | undefined {
  const { records } = useServices();
  return useLive(classId ? (listener) => records.watchKeptCount(classId, listener) : null, [records, classId]);
}

/**
 * The result of one asynchronous question, asked again when `deps` change. It keeps showing the last answer while a newer one loads,
 * so it is `undefined` only before the first answer or while `load` is null.
 */
export function useAsked<T>(load: (() => Promise<T>) | null, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T>();

  useEffect(() => {
    if (!load) {
      setValue(undefined);
      return undefined;
    }
    let active = true;
    void load().then((loaded) => {
      if (active) setValue(() => loaded);
    });
    return () => {
      active = false;
    };
    // The caller lists what `load` closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}

/** The answer-card reader and printer; null until its code has loaded. */
export function useCardCodec(): CardCodec | null {
  const { loadCardCodec } = useServices();
  const [codec, setCodec] = useState<CardCodec | null>(null);

  useEffect(() => {
    let active = true;
    void loadCardCodec().then((loaded) => {
      if (active) setCodec(loaded);
    });
    return () => {
      active = false;
    };
  }, [loadCardCodec]);

  return codec;
}
