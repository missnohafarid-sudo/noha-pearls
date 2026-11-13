import {
  isAnswerValue, isCard, isClassCode, isId, isName, isPacingMode, isPeriod, isPeriodKind, listOf, MAX_COLUMN_HEADER_LENGTH, MAX_MIN_INTERACTIONS, MAX_RAW_MESSAGE_LENGTH, MAX_TITLE_LENGTH, nonEmptyText, nullable, number, oneOf, slideIndex, text, type Check,
} from '../domain/argumentChecks';
import { isDateRange, isGroup, isImportMode, isLesson, isSiteContent, isStudent, isSubject, isYearEnd } from '../domain/entityChecks';
import { MAX_ADMIN_MESSAGE_LENGTH } from '../ports/limits';
import { UI_SURFACE } from './Services';

const none: readonly Check[] = [];
const id: readonly Check[] = [isId];
const longText = text(MAX_ADMIN_MESSAGE_LENGTH);
const optionalFolder = nullable(isId);

type Shapes = { [S in keyof typeof UI_SURFACE]: { readonly [M in (typeof UI_SURFACE)[S][number]]: readonly Check[] } };

/**
 * The one table of what every method of `UI_SURFACE` takes, argument by argument (a live read's listener is not an argument here).
 * The dispatcher refuses a call whose arguments do not fit before any service runs, for the admin too.
 */
export const SURFACE_SHAPES = {
  allowance: { watchLevel: none },
  content: { watchSite: none, updateSite: [isSiteContent] },
  roster: {
    watchClasses: none, watchRoster: id, addClass: [isName], renameClass: [isId, isName], removeClass: id, addGroup: [isId, isName], saveGroup: [isGroup], removeGroup: id,
    addStudent: [isName, isId], saveStudent: [isStudent], removeStudent: id, importFromText: [isId, longText, isImportMode], exportToText: [isId, text(MAX_COLUMN_HEADER_LENGTH)],
  },
  teachers: { watchTeachers: none, add: [isName], rename: [isId, isName], remove: id },
  folders: { watchFolders: none, add: [isName, optionalFolder], rename: [isId, isName], move: [isId, optionalFolder], remove: id },
  lessons: {
    watchLessons: none, watchLesson: id, create: [nonEmptyText(MAX_TITLE_LENGTH), optionalFolder], save: [isLesson], moveToFolder: [isId, optionalFolder], remove: id,
    importFromText: [longText, optionalFolder], exportToText: [isLesson],
  },
  sessions: {
    watchAll: none, watchLive: none, start: [isId, isId, isId], end: id, goTo: [isId, slideIndex], reveal: [isId, isId], setPacing: [isId, listOf(isId), isPacingMode],
    sendMessage: [isId, text(MAX_RAW_MESSAGE_LENGTH), optionalFolder], clearMessage: id, setMinInteractions: [isId, number(0, MAX_MIN_INTERACTIONS)],
  },
  classLookup: { watchAnyLive: none, watchByCode: [isClassCode] },
  sessionRoster: {
    watchRoster: id, watchSeen: [isClassCode], moveStudent: [isId, isId, isId], addStudent: [isId, isName, isId], renameGroup: [isId, isId, isName], markPresent: [isId, isId], markAbsent: [isId, isId],
  },
  participants: { watchParticipants: id, watchMine: id, watchNameClaims: [isClassCode], join: [isClassCode, isId, optionalFolder], leave: id },
  admission: { admit: [isId, optionalFolder], takeRoll: [isId, listOf(isId)], admitAll: id, remove: id },
  answers: {
    watchAnswers: id, submitFromDevice: [isId, isId, isAnswerValue], submitForStudent: [isId, isId, isId, isAnswerValue, oneOf('card', 'manual')], clearForStudent: [isId, isId, isId],
  },
  rewards: { watchRewards: id, watchHeartCount: [isClassCode], giveAsTeacher: [isId, isSubject], giveAsPeer: [isId, isId] },
  records: {
    currentPeriod: [isPeriodKind], standingsOf: [isId, isPeriod], groupStandingsOf: [isClassCode, isPeriodKind], ownStandingIn: [isId, isPeriodKind], watchKeptCount: [isClassCode], watchClassKeptCount: id,
  },
  retention: { watchSettings: none, watchNotices: none, rangeLimits: none, setYearEnd: [isYearEnd], classesToRemove: [isId, isDateRange], removeClasses: [isId, isDateRange, listOf(isId)] },
  board: { watchTotals: [isClassCode], watchCardResults: [isClassCode, isCard] },
  seatView: { watchMine: id, watchLesson: id },
} as const satisfies Shapes;

/** Whether the arguments fit the shapes of this method: as many as it takes, each of the kind it takes. */
export function argumentsFit(service: string, method: string, args: readonly unknown[]): boolean {
  const shapes: readonly Check[] | undefined = (SURFACE_SHAPES as Record<string, Record<string, readonly Check[]>>)[service]?.[method];
  return shapes !== undefined && shapes.length === args.length && shapes.every((check, index) => check(args[index]));
}
