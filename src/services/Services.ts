import type { MarkerDetector, MarkerRenderer, QrRenderer } from '../ports/codes';
import type { AllowanceService } from './AllowanceService';
import type { AdmissionService } from './AdmissionService';
import type { AnswerService } from './AnswerService';
import type { AuthService } from './AuthService';
import type { BoardService } from './BoardService';
import type { ClassLookupService } from './ClassLookupService';
import type { ContentService } from './ContentService';
import type { FolderService } from './FolderService';
import type { LessonService } from './LessonService';
import type { ParticipantService } from './ParticipantService';
import type { RecordService } from './RecordService';
import type { RetentionService } from './RetentionService';
import type { RewardService } from './RewardService';
import type { RosterService } from './RosterService';
import type { SeatViewService } from './SeatViewService';
import type { SessionRosterService } from './SessionRosterService';
import type { SessionService } from './SessionService';
import type { TeacherService } from './TeacherService';

export type CardCodec = MarkerDetector & MarkerRenderer;

/** The service classes as the composition root builds them, internals included. */
export interface ServiceClasses {
  content: ContentService;
  roster: RosterService;
  teachers: TeacherService;
  folders: FolderService;
  lessons: LessonService;
  sessions: SessionService;
  allowance: AllowanceService;
  classLookup: ClassLookupService;
  sessionRoster: SessionRosterService;
  participants: ParticipantService;
  admission: AdmissionService;
  answers: AnswerService;
  rewards: RewardService;
  records: RecordService;
  retention: RetentionService;
  board: BoardService;
  seatView: SeatViewService;
}

/**
 * The one table of what the interface may ask of the application: for each service, the names of its methods.
 * A method missing here is internal: `sessionRoster.rosterOf`, `watchRosterOf`, `joinRoll`, `addToRoll`,
 * `roster.rosterOfClass`, `lessons.moveLessons`, `lessons.watchPlacements`, `participants.admittedSeat`, `watchReader`, `records.keep`, `retention.clearIfDue`.
 */
export const UI_SURFACE = {
  content: ['watchSite', 'updateSite'],
  roster: ['watchClasses', 'watchRoster', 'addClass', 'renameClass', 'removeClass', 'addGroup', 'saveGroup', 'removeGroup', 'addStudent', 'saveStudent', 'removeStudent', 'importFromText', 'exportToText'],
  teachers: ['watchTeachers', 'add', 'rename', 'remove'],
  folders: ['watchFolders', 'add', 'rename', 'move', 'remove'],
  lessons: ['watchLessons', 'watchLesson', 'create', 'save', 'moveToFolder', 'remove', 'importFromText', 'exportToText'],
  sessions: ['watchAll', 'start', 'end', 'goTo', 'reveal', 'setPacing', 'sendMessage', 'clearMessage', 'setMinInteractions'],
  allowance: ['watchLevel'],
  classLookup: ['watchAnyLive', 'watchByCode'],
  sessionRoster: ['watchRoster', 'watchSeen', 'moveStudent', 'addStudent', 'renameGroup', 'markPresent', 'markAbsent'],
  participants: ['watchParticipants', 'watchMine', 'watchNameClaims', 'join', 'leave'],
  admission: ['admit', 'takeRoll', 'admitAll', 'remove'],
  answers: ['watchAnswers', 'submitFromDevice', 'submitForStudent', 'clearForStudent'],
  rewards: ['watchRewards', 'watchHeartCount', 'giveAsTeacher', 'giveAsPeer'],
  records: ['currentPeriod', 'standingsOf', 'groupStandingsOf', 'ownStandingIn', 'watchKeptCount'],
  retention: ['watchSettings', 'watchNotices', 'rangeLimits', 'setYearEnd', 'classesToRemove', 'removeClasses'],
  board: ['watchTotals', 'watchCardResults'],
  seatView: ['watchMine', 'watchLesson'],
} as const satisfies { [S in keyof ServiceClasses]: readonly (keyof ServiceClasses[S])[] };

/** The use cases over stored data, as the interface sees them. */
export type DataServices = { [S in keyof typeof UI_SURFACE]: Pick<ServiceClasses[S], Extract<(typeof UI_SURFACE)[S][number], keyof ServiceClasses[S]>> };

/** Everything the interface may ask of the application. The composition root builds one. */
export type Services = DataServices & {
  auth: AuthService;
  qr: QrRenderer;
  /** Loaded on demand: only the teacher's scanner and the card printer need it. */
  loadCardCodec(): Promise<CardCodec>;
};
