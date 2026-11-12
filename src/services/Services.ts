import type { MarkerDetector, MarkerRenderer, QrRenderer } from '../ports/codes';
import type { AdmissionService } from './AdmissionService';
import type { AnswerService } from './AnswerService';
import type { AuthService } from './AuthService';
import type { ContentService } from './ContentService';
import type { FolderService } from './FolderService';
import type { LessonService } from './LessonService';
import type { ParticipantService } from './ParticipantService';
import type { RecordService } from './RecordService';
import type { RewardService } from './RewardService';
import type { RosterService } from './RosterService';
import type { SessionRosterService } from './SessionRosterService';
import type { SessionService } from './SessionService';
import type { TeacherService } from './TeacherService';

export type CardCodec = MarkerDetector & MarkerRenderer;

/** The public shape of a service class: what a caller may use, without its internals. */
export type Api<T> = { [K in keyof T]: T[K] };

/** The use cases over stored data. Built the same way wherever they run. */
export interface DataServices {
  content: Api<ContentService>;
  roster: Api<RosterService>;
  teachers: Api<TeacherService>;
  folders: Api<FolderService>;
  /** `moveLessons` is the folder service's alone. */
  lessons: Omit<Api<LessonService>, 'moveLessons'>;
  sessions: Api<SessionService>;
  sessionRoster: Api<SessionRosterService>;
  participants: Api<ParticipantService>;
  admission: Api<AdmissionService>;
  answers: Api<AnswerService>;
  rewards: Api<RewardService>;
  records: Api<RecordService>;
}

/** Everything the interface may ask of the application. The composition root builds one. */
export interface Services extends DataServices {
  auth: Api<AuthService>;
  qr: QrRenderer;
  /** Loaded on demand: only the teacher's scanner and the card printer need it. */
  loadCardCodec(): Promise<CardCodec>;
}
