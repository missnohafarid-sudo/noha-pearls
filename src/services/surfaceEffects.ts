import type { CallEffect } from '../domain/abuse';
import type { ServiceClasses } from './Services';

type Tagged = { [S in keyof ServiceClasses]?: readonly (keyof ServiceClasses[S])[] };

/**
 * What each method of `UI_SURFACE` does, which the day's allowance of writes (`domain/abuse.ts`) goes by: it only reads; it is a write
 * the school cannot do without (a student answering, asking for a seat, giving it up); or it is an ordinary write.
 * Every method of the surface is named in exactly one list, and a test fails for one that is in none.
 */
export const SURFACE_EFFECTS = {
  read: {
    content: ['watchSite'],
    roster: ['watchClasses', 'watchRoster', 'exportToText'],
    teachers: ['watchTeachers'],
    folders: ['watchFolders'],
    lessons: ['watchLessons', 'watchLesson', 'exportToText'],
    sessions: ['watchAll', 'watchLive'],
    allowance: ['watchLevel'],
    classLookup: ['watchAnyLive', 'watchByCode'],
    sessionRoster: ['watchRoster', 'watchSeen'],
    participants: ['watchParticipants', 'watchMine', 'watchNameClaims'],
    answers: ['watchAnswers'],
    rewards: ['watchRewards', 'watchHeartCount'],
    records: ['currentPeriod', 'standingsOf', 'groupStandingsOf', 'ownStandingIn', 'watchKeptCount', 'watchClassKeptCount'],
    retention: ['watchSettings', 'watchNotices', 'rangeLimits', 'classesToRemove'],
    board: ['watchTotals', 'watchCardResults'],
    seatView: ['watchMine', 'watchLesson'],
  },
  essential: {
    participants: ['join', 'leave'],
    answers: ['submitFromDevice', 'submitForMember'],
  },
  ordinary: {
    content: ['updateSite'],
    roster: ['addClass', 'renameClass', 'removeClass', 'addGroup', 'saveGroup', 'removeGroup', 'addStudent', 'saveStudent', 'removeStudent', 'importFromText'],
    teachers: ['add', 'rename', 'remove'],
    folders: ['add', 'rename', 'move', 'remove'],
    lessons: ['create', 'save', 'moveToFolder', 'setPublished', 'remove', 'importFromText'],
    sessions: ['start', 'end', 'goTo', 'reveal', 'setPacing', 'sendMessage', 'clearMessage', 'setMinInteractions'],
    sessionRoster: ['moveStudent', 'addStudent', 'renameGroup', 'markPresent', 'markAbsent'],
    admission: ['admit', 'takeRoll', 'admitAll', 'remove'],
    answers: ['submitForStudent', 'clearForStudent'],
    rewards: ['giveAsTeacher', 'takeAsTeacher', 'giveAsPeer'],
    retention: ['setYearEnd', 'removeClasses'],
  },
} as const satisfies Record<CallEffect, Tagged>;

const EFFECTS = Object.keys(SURFACE_EFFECTS) as CallEffect[];

/** The effects a method is tagged with: one for every method of the surface. */
export function effectsOf(service: string, method: string): CallEffect[] {
  return EFFECTS.filter((effect) => {
    const lists: Record<string, readonly string[]> = SURFACE_EFFECTS[effect];
    return Object.hasOwn(lists, service) && lists[service].includes(method);
  });
}

/** What a call does; a name that is not tagged is treated as an ordinary write. */
export const effectOf = (service: string, method: string): CallEffect => effectsOf(service, method)[0] ?? 'ordinary';
