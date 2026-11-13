import { useEffect, useMemo, useState, useSyncExternalStore, type DependencyList } from 'react';
import type { CardCodec } from '../../services/Services';
import { FolderTree } from '../../domain/folders';
import type { Answer, ClassRoster, Id, Lesson, LessonFolder, LessonSummary, Participant, Reward, RetentionSettings, SchoolClass, Session, SessionRoster, SiteContent, Teacher } from '../../domain/models';
import type { SeatView } from '../../domain/visibility';
import type { ClearingNotices } from '../../services/RetentionService';
import { useServices } from '../ServicesContext';
import { useLive, type Subscribe } from './useLive';

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

/** Whether the page can reach its data. */
export function useConnected(): boolean {
  const { connection } = useServices();
  return useSyncExternalStore(
    (listener) => connection.subscribe(listener),
    () => connection.isUp(),
  );
}

/** A live read whose result depends on who is signed in: it subscribes again when sign-in changes. */
function useCallerLive<T>(subscribe: Subscribe<T> | null, deps: DependencyList): T | undefined {
  const admin = useAdmin();
  return useLive(subscribe, [...deps, admin]);
}

/** A live read only the teacher may make: nothing is asked of the services for anyone else, and it starts when she signs in. */
export function useAdminLive<T>(subscribe: Subscribe<T> | null, deps: DependencyList): T | undefined {
  const admin = useAdmin();
  return useLive(admin ? subscribe : null, [...deps, admin]);
}

export function useSite(): SiteContent | null | undefined {
  const { content } = useServices();
  return useLive((listener) => content.watchSite(listener), [content]);
}

export function useClasses(): SchoolClass[] | undefined {
  const { roster } = useServices();
  return useAdminLive((listener) => roster.watchClasses(listener), [roster]);
}

export function useTeachers(): Teacher[] | undefined {
  const { teachers } = useServices();
  return useLive((listener) => teachers.watchTeachers(listener), [teachers]);
}

export function useFolders(): LessonFolder[] | undefined {
  const { folders } = useServices();
  return useCallerLive((listener) => folders.watchFolders(listener), [folders]);
}

/** The lesson folders read once per change; every question about the tree is asked of it. */
export function useFolderTree(): FolderTree | undefined {
  const folders = useFolders();
  return useMemo(() => folders && new FolderTree(folders), [folders]);
}

/** The groups and students of one school class: what its list shows and edits. */
export function useClassRoster(classId: MaybeId): ClassRoster | undefined {
  const { roster } = useServices();
  return useAdminLive(classId ? (listener) => roster.watchRoster(classId, listener) : null, [roster, classId]);
}

/**
 * The groups and students a class (a session) uses: every screen of a session asks here and nowhere else.
 * They are the session's own copy of its class's, so the class list changing never reaches a session.
 */
export function useSessionRoster(session: Session | null | undefined): SessionRoster | undefined {
  const { sessionRoster } = useServices();
  const sessionId = session?.id;
  return useAdminLive(sessionId ? (listener) => sessionRoster.watchRoster(sessionId, listener) : null, [sessionRoster, sessionId]);
}

export function useLessons(): LessonSummary[] | undefined {
  const { lessons } = useServices();
  return useCallerLive((listener) => lessons.watchLessons(listener), [lessons]);
}

export function useLesson(lessonId: MaybeId): Lesson | null | undefined {
  const { lessons } = useServices();
  return useCallerLive(lessonId ? (listener) => lessons.watchLesson(lessonId, listener) : null, [lessons, lessonId]);
}

/** The lesson of one class, whether or not it is published; null when the class names none that is stored. */
export function useLessonOf(sessionId: MaybeId): Lesson | null | undefined {
  const { seatView } = useServices();
  return useCallerLive(sessionId ? (listener) => seatView.watchLesson(sessionId, listener) : null, [seatView, sessionId]);
}

export function useSessions(): Session[] | undefined {
  const { sessions } = useServices();
  return useAdminLive((listener) => sessions.watchAll(listener), [sessions]);
}

/** The classes running now, newest first. */
export function useLiveSessions(): Session[] | undefined {
  const { sessions } = useServices();
  return useAdminLive((listener) => sessions.watchLive(listener), [sessions]);
}

/** Whether any class is running now. */
export function useAnyLive(): boolean | undefined {
  const { classLookup } = useServices();
  return useLive((listener) => classLookup.watchAnyLive(listener), [classLookup]);
}

export function useSessionByCode(code: string | null): Session | null | undefined {
  const { classLookup } = useServices();
  return useCallerLive(code === null ? null : (listener) => classLookup.watchByCode(code, listener), [classLookup, code]);
}

export function useAnswers(sessionId: MaybeId): Answer[] | undefined {
  const { answers } = useServices();
  return useAdminLive(sessionId ? (listener) => answers.watchAnswers(sessionId, listener) : null, [answers, sessionId]);
}

export function useRewards(sessionId: MaybeId): Reward[] | undefined {
  const { rewards } = useServices();
  return useAdminLive(sessionId ? (listener) => rewards.watchRewards(sessionId, listener) : null, [rewards, sessionId]);
}

export function useParticipants(sessionId: MaybeId): Participant[] | undefined {
  const { participants } = useServices();
  return useAdminLive(
    sessionId ? (listener) => participants.watchParticipants(sessionId, listener) : null,
    [participants, sessionId],
  );
}

/** This device's seat in the session; null when it has not joined yet. */
export function useMyParticipant(sessionId: MaybeId): Participant | null | undefined {
  const { participants } = useServices();
  return useLive(sessionId ? (listener) => participants.watchMine(sessionId, listener) : null, [participants, sessionId]);
}

/** What a let-in device shows of the class; null when this device holds no let-in seat. */
export function useSeatView(sessionId: MaybeId): SeatView | null | undefined {
  const { seatView } = useServices();
  return useLive(sessionId ? (listener) => seatView.watchMine(sessionId, listener) : null, [seatView, sessionId]);
}

/** When students' data is cleared; null when none were ever saved. Admin only: nothing is asked of anyone else. */
export function useRetentionSettings(): RetentionSettings | null | undefined {
  const { retention } = useServices();
  return useAdminLive((listener) => retention.watchSettings(listener), [retention]);
}

/** The clearing of students' data that is coming within a week, and the one that ran within the last week. Admin only. */
export function useClearingNotices(): ClearingNotices | undefined {
  const { retention } = useServices();
  return useAdminLive((listener) => retention.watchNotices(listener), [retention]);
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
